// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import simpleGit, { SimpleGit } from "simple-git";

import * as child_process from "child_process";

import * as path from "path";
import * as fs from "fs";

import {
  ResolvedVersionsKind,
  ResolvedVersionsSuccess,
  Resolver,
} from "./resolver";
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

interface UpdatablePackage {
  pkg: Package;
  version: ResolvedVersionsSuccess;
}

export async function runApp(
  workspacePath: string,
  githubToken: string,
  resolveLatestPkgVersions: Resolver
): Promise<void> {
  core.startGroup("Find package paths");
  const pkgPrefixes = ["cross", "native"];
  const pkgPaths: PkgPath[] = findPackagePaths(workspacePath, pkgPrefixes);
  core.endGroup();

  core.startGroup("Generate pkg-info.json files");
  generatePkgInfoFiles(workspacePath);
  core.endGroup();

  core.startGroup("Read package info");
  const packages: Package[] = getPackageInfo(workspacePath, pkgPaths);
  core.endGroup();

  core.startGroup("Resolve latest package versions");
  const updatablePackages: UpdatablePackage[] = await getUpdatablePackages(
    packages,
    resolveLatestPkgVersions
  );
  core.endGroup();

  core.startGroup("Create example patches for outdated packages");
  const git: SimpleGit = simpleGit(workspacePath);

  const octokit = github.getOctokit(githubToken) as Octokit;

  // TODO: Uncomment this for the real thing
  //await git.addConfig("user.name", "spksrc-deps");
  //await git.addConfig("user.email", "spksrc-deps@synocommunity.github.io");

  // Make sure we have all the remote branches, not just the one we cloned.
  await git.fetch();
  const branches = await git.branch();
  const originalBranch = branches.current;

  for (const update of updatablePackages) {
    // TODO: Create mechanism in makefile to select what kind of version we
    //       want to create PRs for (e.g. PKG_DEP_WARN=MINOR)
    const updateVersion = update.version.latestVersionMinor;

    // Do not bother creating a PR if there is not an update on the selected
    // update channel.
    if (
      update.version.currentVersion.displayVersion ===
      updateVersion.displayVersion
    ) {
      console.info(
        "Skipping " +
          update.pkg.path.display +
          " because there are no updates on the selected channel."
      );
      continue;
    }

    const prBranch =
      "deps/" + update.pkg.path.display + "/" + updateVersion.displayVersion;

    if (
      branches.all.some(
        (branch) => branch === prBranch || branch === "origin/" + prBranch
      )
    ) {
      console.info(
        "Skipping " +
          update.pkg.path.display +
          " because there is an existing PR branch."
      );
      continue;
    }

    core.info("Creating branch: " + prBranch);
    await git.checkout(["-b", prBranch, originalBranch]);

    const fullPkgPath = path.join(
      workspacePath,
      update.pkg.path.prefix,
      update.pkg.path.dir
    );
    const makefile = path.join(fullPkgPath, "Makefile");

    core.info("Patching makefile: " + makefile);
    const patchResponse = child_process.spawnSync("sed", [
      "-i",
      "s/^PKG_VERS\\s*=.*$/PKG_VERS = " + updateVersion.displayVersion + "/",
      makefile,
    ]);

    if (patchResponse.error) {
      core.error(patchResponse.error.message);

      // TODO: Clean up so things do not go horribly wrong from this point on
      continue;
    }

    await git.add(makefile);

    // TODO: rerun `make pkg-info.json` and try to check the patch did what we
    //       wanted (in case of fancy stuff being done with PKG_VERS).

    const digestsFile = path.join(fullPkgPath, "digests");
    core.info("Generating digests: " + digestsFile);
    const mkDigests = child_process.spawnSync("make", [
      "-C",
      fullPkgPath,
      "digests",
    ]);

    // TODO: Check `make digests` worked

    await git.add(digestsFile);

    // TODO: Try to fix PLIST (e.g. update mylib.1.so -> mylib.2.so)

    const commitMessage =
      "Bump " + update.pkg.path.display + " to " + updateVersion.displayVersion;

    core.info("Committing patch");
    await git.commit(commitMessage);

    core.info("Pushing PR branch");
    await git.push("origin", prBranch);

    /*
    core.info("Creating pull request");
    const owner = "rbrownwsws";
    const repo = " spksrc-deps-playground";

    // FIXME: use me for the real thing!
    // const owner = github.context.repo.owner;
    // const repo = github.context.repo.repo;

    const prCreateResponse = await octokit.rest.pulls.create({
      owner: owner,
      repo: repo,
      head: prBranch,
      base: "master",
      title: commitMessage,
      body: "",
      maintainer_can_modify: true,
    });
    */

    // TODO: Create issue using octokit?

    // TODO: Close/delete any old pull requests using octokit?
  }

  git.checkout(originalBranch);
  core.endGroup();
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

function generatePkgInfoFiles(workspacePath: string) {
  // Get make to generate package info
  const mkPkgInfo = child_process.spawnSync("make", [
    "-C",
    workspacePath,
    "pkg-info",
  ]);

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

async function getUpdatablePackages(
  packages: Package[],
  resolveLatestPkgVersions: Resolver
): Promise<UpdatablePackage[]> {
  const updatablePackages: UpdatablePackage[] = [];

  for (const pkg of packages) {
    const resolvedVersion = await resolveLatestPkgVersions(pkg.info);

    if (resolvedVersion.kind === ResolvedVersionsKind.SUCCESS) {
      if (
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionMajor.displayVersion ||
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionMinor.displayVersion ||
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionPatch.displayVersion
      ) {
        core.info(
          pkg.path.display +
            " is OLD: [" +
            resolvedVersion.currentVersion.displayVersion +
            "] > " +
            resolvedVersion.latestVersionPatch.displayVersion +
            " >> " +
            resolvedVersion.latestVersionMinor.displayVersion +
            " >>> " +
            resolvedVersion.latestVersionMajor.displayVersion
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
