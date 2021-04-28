// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import simpleGit, { ResetMode, SimpleGit } from "simple-git";

import * as path from "path";

import { runMake } from "./makeRunner";

import {
  UpgradePathsKind,
  UpgradePathsSuccess,
  UpgradeResolver,
} from "./upgradeResolver";
import { Octokit } from "@octokit/rest";
import { PackagePatcher } from "./packagePatcher";
import { PackageIndexer, PkgPath } from "./packageIndexer";
import { Package, PackageInfoScraper } from "./packageInfoScraper";

interface UpgradablePackage {
  pkg: Package;
  version: UpgradePathsSuccess;
}

export interface AppConfig {
  workspacePath: string;
  githubToken: string;
  owner: string;
  repo: string;
  findPackages: PackageIndexer;
  getPackageInfo: PackageInfoScraper;
  resolveLatestPkgVersions: UpgradeResolver;
  patchPackage: PackagePatcher;
}

export async function runApp({
  workspacePath,
  githubToken,
  owner,
  repo,
  findPackages,
  getPackageInfo,
  resolveLatestPkgVersions,
  patchPackage,
}: AppConfig): Promise<void> {
  core.startGroup("Find package paths");
  const pkgPrefixes = ["cross", "native"];
  const pkgPaths: PkgPath[] = findPackages(workspacePath, pkgPrefixes);
  core.endGroup();

  core.startGroup("Get package info");
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
    const patchResponse = patchPackage(makefile, updateVersion.version);

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

async function getUpgradablePackages(
  packages: Package[],
  resolveLatestPkgVersions: UpgradeResolver
): Promise<UpgradablePackage[]> {
  const updatablePackages: UpgradablePackage[] = [];

  // For each package
  for (const pkg of packages) {
    const upgradePaths = await resolveLatestPkgVersions(pkg.info);

    // If we managed to resolve upgrades
    if (upgradePaths.kind === UpgradePathsKind.SUCCESS) {
      // If any of the "upgrade" releases are different from the current release
      if (
        upgradePaths.currentVersionRelease.version.displayVersion !==
          upgradePaths.majorVersionUpgradeRelease.version.displayVersion ||
        upgradePaths.currentVersionRelease.version.displayVersion !==
          upgradePaths.minorVersionUpgradeRelease.version.displayVersion ||
        upgradePaths.currentVersionRelease.version.displayVersion !==
          upgradePaths.patchVersionUpgradeRelease.version.displayVersion
      ) {
        core.info(
          pkg.path.display +
            " is OLD: [" +
            upgradePaths.currentVersionRelease.version.displayVersion +
            "] > " +
            upgradePaths.patchVersionUpgradeRelease.version.displayVersion +
            " >> " +
            upgradePaths.minorVersionUpgradeRelease.version.displayVersion +
            " >>> " +
            upgradePaths.majorVersionUpgradeRelease.version.displayVersion
        );
        updatablePackages.push({
          pkg: pkg,
          version: upgradePaths,
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
