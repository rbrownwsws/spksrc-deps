// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";

import path from "path";
import fs from "fs";

import { runMake } from "./makeRunner";

import {
  UpgradePathsKind,
  UpgradePathsSuccess,
  UpgradeResolver,
} from "./upgradeResolver";
import { PackagePatcher } from "./packagePatcher";
import { PackageIndexer, PkgPath } from "./packageIndexer";
import { Package, PackageInfoScraper } from "./packageInfoScraper";
import { Vcs, VcsFactory } from "./vcs";
import { Project } from "./project";

interface UpgradablePackage {
  pkg: Package;
  upgradePaths: UpgradePathsSuccess;
}

interface UpgradePatch {
  upgrade: UpgradablePackage;
  branch: string;
  description: string;
}

export interface AppConfig {
  wantPatches: boolean;
  wantPullRequests: boolean;
  wantIssues: boolean;
  workspacePath: string;
  findPackages: PackageIndexer;
  getPackageInfo: PackageInfoScraper;
  resolveLatestPkgVersions: UpgradeResolver;
  getVcs: VcsFactory;
  patchPackage: PackagePatcher;
  project: Project;
}

export async function runApp({
  wantPatches,
  wantPullRequests,
  wantIssues,
  workspacePath,
  findPackages,
  getPackageInfo,
  resolveLatestPkgVersions,
  getVcs,
  patchPackage,
  project,
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

  const vcs: Vcs = await getVcs(workspacePath);

  if (wantPatches) {
    core.startGroup("Create example patches for outdated packages");
    const upgradePatches: UpgradePatch[] = await createUpgradePatches(
      workspacePath,
      vcs,
      patchPackage,
      upgradablePackages
    );
    core.endGroup();

    if (wantPullRequests) {
      core.startGroup("Create Pull Requests for outdated packages");
      await createPullRequests(upgradePatches, vcs, project);
      core.endGroup();
    }
  }

  // TODO: Create issue using octokit?

  await vcs.reset();
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
          upgradePaths: upgradePaths,
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

async function createUpgradePatches(
  workspacePath: string,
  vcs: Vcs,
  patchPackage: PackagePatcher,
  upgradablePackages: UpgradablePackage[]
) {
  const upgradePatches: UpgradePatch[] = [];

  for (const upgradablePackage of upgradablePackages) {
    const msgPrefix = "[" + upgradablePackage.pkg.path.display + "] ";

    // TODO: Create mechanism in makefile to select what kind of version we
    //       want to create PRs for (e.g. PKG_DEP_WARN=MINOR)
    const upgradeVersion =
      upgradablePackage.upgradePaths.minorVersionUpgradeRelease;

    // Do not bother creating a PR if there is not an update on the selected
    // update channel.
    if (
      upgradablePackage.upgradePaths.currentVersionRelease.version
        .displayVersion === upgradeVersion.version.displayVersion
    ) {
      console.info(
        msgPrefix +
          "Skipping " +
          upgradablePackage.pkg.path.display +
          " because there are no updates on the selected channel."
      );
      continue;
    }

    const branch =
      "deps/" +
      upgradablePackage.pkg.path.display +
      "/" +
      upgradeVersion.version.displayVersion;

    if (vcs.hasBranch(branch)) {
      console.info(
        msgPrefix +
          "Skipping " +
          upgradablePackage.pkg.path.display +
          " because there is an existing PR branch."
      );
      continue;
    }

    core.info(msgPrefix + "Creating branch: " + branch);
    await vcs.startNewPatch(branch);

    const fullPkgPath = path.join(
      workspacePath,
      upgradablePackage.pkg.path.prefix,
      upgradablePackage.pkg.path.dir
    );

    core.info(msgPrefix + "Patching makefile");
    const makefile = path.join(fullPkgPath, "Makefile");
    const patchResponse = patchPackage(makefile, upgradeVersion.version);

    if (patchResponse.error) {
      core.error(msgPrefix + patchResponse.error.message);

      core.info(msgPrefix + "Aborting and cleaning up");
      await vcs.abortPatch;

      continue;
    }

    await vcs.addFileToPatch(makefile);

    // TODO: rerun `make pkg-info.json` and try to check the patch did what we
    //       wanted (in case of fancy stuff being done with PKG_VERS).

    core.info(msgPrefix + "Generating digests");
    const digestsFile = path.join(fullPkgPath, "digests");

    const preUpgradeDigests = fs.readFileSync(digestsFile);

    const mkDigests = runMake(fullPkgPath, "digests");
    if (mkDigests.error) {
      core.error(msgPrefix + mkDigests.error.message);

      core.info(msgPrefix + "Aborting and cleaning up");
      await vcs.abortPatch();

      continue;
    }

    const postUpgradeDigests = fs.readFileSync(digestsFile);

    // Check the digests file updated
    if (preUpgradeDigests.equals(postUpgradeDigests)) {
      core.error(
        msgPrefix +
          "The digests file was not updated. The patch must not have worked."
      );

      core.info(msgPrefix + "Aborting and cleaning up");
      await vcs.abortPatch();

      continue;
    }

    await vcs.addFileToPatch(digestsFile);

    // TODO: Try to fix PLIST (e.g. update mylib.1.so -> mylib.2.so)

    const commitMessage =
      "Bump " +
      upgradablePackage.pkg.path.display +
      " to " +
      upgradeVersion.version.displayVersion;

    core.info(msgPrefix + "Committing patch");
    await vcs.finishPatch(commitMessage);

    upgradePatches.push({
      upgrade: upgradablePackage,
      branch: branch,
      description: commitMessage,
    });
  }

  return upgradePatches;
}

async function createPullRequests(
  upgradePatches: UpgradePatch[],
  vcs: Vcs,
  project: Project
) {
  for (const upgradePatch of upgradePatches) {
    const msgPrefix = "[" + upgradePatch.upgrade.pkg.path.display + "] ";

    core.info(msgPrefix + "Pushing PR branch");
    await vcs.pushPatch(upgradePatch.branch);

    core.info(msgPrefix + "Creating pull request");
    await project.createPullRequest({
      head: upgradePatch.branch,
      title: upgradePatch.description,
      body:
        "## *WARNING*\n" +
        "\n" +
        "This is an auto-generated patch and will need human intervention " +
        "before it is safe to merge. " +
        "See the `Pre-merge checklist` for the base set of tasks you should" +
        "perform before merging.\n" +
        "\n" +
        "You may also want to consider upgrading to a different version than " +
        "has been automatically chosen. See the `Version Info` section for " +
        "more details.\n" +
        "\n" +
        "## Pre-merge checklist:\n" +
        "\n" +
        "- [ ] Check package still builds for supported arches\n" +
        "- [ ] Check if `PLIST` needs to be updated\n" +
        "- [ ] Check that this package and any dependent packages still work " +
        "as expected\n" +
        "- [ ] Check if there are any SPKs (e.g.: `spk/" +
        upgradePatch.upgrade.pkg.path.dir +
        "`) that need to be updated when this package is upgraded\n" +
        "\n" +
        "## Version info:\n" +
        "\n" +
        "| Type | Version |\n" +
        "| - | - |\n" +
        "| Current |" +
        upgradePatch.upgrade.upgradePaths.currentVersionRelease.version
          .rawVersion +
        " |\n" +
        "| Patch upgrade |" +
        upgradePatch.upgrade.upgradePaths.patchVersionUpgradeRelease.version
          .rawVersion +
        " |\n" +
        "| Minor upgrade |" +
        upgradePatch.upgrade.upgradePaths.minorVersionUpgradeRelease.version
          .rawVersion +
        " |\n" +
        "| Major upgrade |" +
        upgradePatch.upgrade.upgradePaths.majorVersionUpgradeRelease.version
          .rawVersion +
        " |",
    });

    // TODO: Close/delete any old pull requests using octokit?
  }
}
