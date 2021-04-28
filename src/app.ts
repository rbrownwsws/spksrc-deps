// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import simpleGit, { ResetMode, SimpleGit } from "simple-git";

import * as child_process from "child_process";

import * as path from "path";
import * as fs from "fs";

import { MakeRunner } from "./makeRunner";

import {
  UpgradePathsKind,
  UpgradePathsSuccess,
  UpgradeResolver,
} from "./upgradeResolver";
import { PkgInfo } from "./pkgInfo";
import { Octokit } from "@octokit/rest";

interface PkgPath {
  prefix: string;
  dir: string;
  display: string;
}

interface Package {
  path: PkgPath;
  info: PkgInfo;
}

interface UpgradablePackage {
  pkg: Package;
  version: UpgradePathsSuccess;
}

export async function runApp(
  workspacePath: string,
  githubToken: string,
  owner: string,
  repo: string,
  runMake: MakeRunner,
  resolveLatestPkgVersions: UpgradeResolver
): Promise<void> {
  core.startGroup("Find package paths");
  const pkgPrefixes = ["cross", "native"];
  const pkgPaths: PkgPath[] = findPackagePaths(workspacePath, pkgPrefixes);
  core.endGroup();

  core.startGroup("Generate pkg-info.json files");
  generatePkgInfoFiles(workspacePath, runMake);
  core.endGroup();

  core.startGroup("Read package info");
  const packages: Package[] = getPackageInfo(workspacePath, pkgPaths);
  core.endGroup();

  core.startGroup("Resolve latest package versions");
  const upgradablePackages: UpgradablePackage[] = await getUpgradablePackages(
    packages,
    resolveLatestPkgVersions
  );
  core.endGroup();

  core.startGroup("Create example patches for outdated packages");
  const git: SimpleGit = simpleGit(workspacePath);

  const octokit = github.getOctokit(githubToken) as Octokit;

  await git.addConfig("user.name", "spksrc-deps");
  await git.addConfig("user.email", "spksrc-deps@synocommunity.github.io");

  // Make sure we have all the remote branches, not just the one we cloned.
  await git.fetch();
  const branches = await git.branch();
  const originalBranch = branches.current;

  for (const update of upgradablePackages) {
    const msgPrefix = "[" + update.pkg.path.display + "] ";

    // TODO: Create mechanism in makefile to select what kind of version we
    //       want to create PRs for (e.g. PKG_DEP_WARN=MINOR)
    const updateVersion = update.version.minorVersionUpgradeRelease;

    // Do not bother creating a PR if there is not an update on the selected
    // update channel.
    if (
      update.version.currentVersionRelease.version.displayVersion ===
      updateVersion.version.displayVersion
    ) {
      console.info(
        msgPrefix +
          "Skipping " +
          update.pkg.path.display +
          " because there are no updates on the selected channel."
      );
      continue;
    }

    const prBranch =
      "deps/" +
      update.pkg.path.display +
      "/" +
      updateVersion.version.displayVersion;

    if (
      branches.all.some(
        (branch) => branch === prBranch || branch === "origin/" + prBranch
      )
    ) {
      console.info(
        msgPrefix +
          "Skipping " +
          update.pkg.path.display +
          " because there is an existing PR branch."
      );
      continue;
    }

    core.info(msgPrefix + "Creating branch: " + prBranch);
    await git.checkout(["-b", prBranch, originalBranch]);

    const fullPkgPath = path.join(
      workspacePath,
      update.pkg.path.prefix,
      update.pkg.path.dir
    );

    core.info(msgPrefix + "Patching makefile");
    const makefile = path.join(fullPkgPath, "Makefile");
    const patchResponse = child_process.spawnSync("sed", [
      "-i",
      "s/^PKG_VERS\\s*=.*$/PKG_VERS = " +
        updateVersion.version.displayVersion +
        "/",
      makefile,
    ]);

    if (patchResponse.error) {
      core.error(msgPrefix + patchResponse.error.message);

      core.info(msgPrefix + "Aborting and cleaning up");
      git.reset(ResetMode.HARD);

      continue;
    }

    await git.add(makefile);

    // TODO: rerun `make pkg-info.json` and try to check the patch did what we
    //       wanted (in case of fancy stuff being done with PKG_VERS).

    core.info(msgPrefix + "Generating digests");
    const digestsFile = path.join(fullPkgPath, "digests");
    const mkDigests = runMake(fullPkgPath, "digests");

    if (mkDigests.error) {
      core.error(msgPrefix + mkDigests.error.message);

      core.info(msgPrefix + "Aborting and cleaning up");
      git.reset(ResetMode.HARD);

      continue;
    }

    // TODO: Check `make digests` worked

    await git.add(digestsFile);

    // TODO: Try to fix PLIST (e.g. update mylib.1.so -> mylib.2.so)

    const commitMessage =
      "Bump " +
      update.pkg.path.display +
      " to " +
      updateVersion.version.displayVersion;

    core.info(msgPrefix + "Committing patch");
    await git.commit(commitMessage);

    core.info(msgPrefix + "Pushing PR branch");
    await git.push("origin", prBranch);

    core.info(msgPrefix + "Creating pull request");
    const prCreateResponse = await octokit.rest.pulls.create({
      owner: owner,
      repo: repo,
      head: prBranch,
      base: "master",
      title: commitMessage,
      body:
        "# Version info:\n" +
        "\n" +
        "| Type | Version |\n" +
        "| - | - |\n" +
        "| Current |" +
        update.version.currentVersionRelease.version.rawVersion +
        " |\n" +
        "| Patch upgrade |" +
        update.version.patchVersionUpgradeRelease.version.rawVersion +
        " |\n" +
        "| Minor upgrade |" +
        update.version.minorVersionUpgradeRelease.version.rawVersion +
        " |\n" +
        "| Major upgrade |" +
        update.version.majorVersionUpgradeRelease.version.rawVersion +
        " |",
    });

    const cooldown = 30000;
    core.info(
      msgPrefix + "Wait for " + cooldown + "ms to avoid GitHub abuse rate limit"
    );
    await new Promise((resolve) => setTimeout(resolve, cooldown));

    // TODO: Create issue using octokit?

    // TODO: Close/delete any old pull requests using octokit?
  }

  git.checkout(originalBranch);
  core.endGroup();
  core.info("Done");
}

function findPackagePaths(workspacePath: string, pkgPrefixes: string[]) {
  const pkgPaths: PkgPath[] = [];

  // Find all the package directories
  for (const prefix of pkgPrefixes) {
    const fullPrefixPath = path.join(workspacePath, prefix);

    // Get all objects in dir
    fs.readdirSync(fullPrefixPath)
      // Turn the objects into PkgPath objects
      .map((name) => {
        return { prefix: prefix, dir: name, display: prefix + "/" + name };
      })
      // Filter out objects that are not directories
      .filter((pkgPath) =>
        fs.lstatSync(path.join(fullPrefixPath, pkgPath.dir)).isDirectory()
      )
      // Put objects into pkgPaths array
      .forEach((pkgPath) => {
        core.info("Found package: " + pkgPath.display);
        pkgPaths.push(pkgPath);
      });
  }

  return pkgPaths;
}

function generatePkgInfoFiles(workspacePath: string, runMake: MakeRunner) {
  // Get make to generate package info
  const mkPkgInfo = runMake(workspacePath, "pkg-info");

  if (mkPkgInfo.error !== undefined) {
    throw mkPkgInfo.error;
  }
}

function getPackageInfo(workspacePath: string, pkgPaths: PkgPath[]): Package[] {
  const packages: Package[] = [];

  for (const pkgPath of pkgPaths) {
    const pkgInfoFile = path.join(
      workspacePath,
      pkgPath.prefix,
      pkgPath.dir,
      "pkg-info.json"
    );

    if (!fs.existsSync(pkgInfoFile)) {
      core.warning("Missing pkg-info.json for: " + pkgPath.display);

      continue;
    }

    let rawPkgInfoData;
    try {
      rawPkgInfoData = fs.readFileSync(pkgInfoFile, "utf-8");
    } catch (error) {
      core.warning(
        "Error while trying to read pkg-info.json for: " +
          pkgPath.display +
          ": " +
          error
      );

      continue;
    }

    let pkgInfo: PkgInfo;
    try {
      pkgInfo = JSON.parse(rawPkgInfoData);
    } catch (error) {
      core.warning(
        "Error while trying to parse pkg-info.json for: " +
          pkgPath.display +
          ": " +
          error
      );

      continue;
    }

    core.info("Got package info for: " + pkgPath.display);
    packages.push({
      path: pkgPath,
      info: pkgInfo,
    });
  }

  return packages;
}

async function getUpgradablePackages(
  packages: Package[],
  resolveLatestPkgVersions: UpgradeResolver
): Promise<UpgradablePackage[]> {
  const updatablePackages: UpgradablePackage[] = [];

  for (const pkg of packages) {
    const resolvedVersion = await resolveLatestPkgVersions(pkg.info);

    if (resolvedVersion.kind === UpgradePathsKind.SUCCESS) {
      if (
        resolvedVersion.currentVersionRelease.version.displayVersion !==
          resolvedVersion.majorVersionUpgradeRelease.version.displayVersion ||
        resolvedVersion.currentVersionRelease.version.displayVersion !==
          resolvedVersion.minorVersionUpgradeRelease.version.displayVersion ||
        resolvedVersion.currentVersionRelease.version.displayVersion !==
          resolvedVersion.patchVersionUpgradeRelease.version.displayVersion
      ) {
        core.info(
          pkg.path.display +
            " is OLD: [" +
            resolvedVersion.currentVersionRelease.version.displayVersion +
            "] > " +
            resolvedVersion.patchVersionUpgradeRelease.version.displayVersion +
            " >> " +
            resolvedVersion.minorVersionUpgradeRelease.version.displayVersion +
            " >>> " +
            resolvedVersion.majorVersionUpgradeRelease.version.displayVersion
        );
        updatablePackages.push({
          pkg: pkg,
          version: resolvedVersion,
        });
      } else {
        core.info(pkg.path.display + " is UP-TO-DATE.");
      }
    } else {
      core.info(pkg.path.display + " is UNKNOWN.");
    }
  }

  return updatablePackages;
}
