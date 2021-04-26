// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import * as child_process from "child_process";

import * as path from "path";
import * as fs from "fs";

import { ResolvedVersionsKind, Resolver } from "./resolver";
import { PkgInfo } from "./pkgInfo";

export async function runApp(
  workspacePath: string,
  githubToken: string,
  resolveLatestPkgVersions: Resolver
): Promise<void> {
  generatePkgInfoFiles(workspacePath);

  const crossPkgsPath = path.join(workspacePath, "cross");

  const pkgInfoFiles = fs
    .readdirSync(crossPkgsPath)
    .map((name) => path.join(crossPkgsPath, name))
    .filter((pkgPath) => fs.lstatSync(pkgPath).isDirectory())
    .map((pkgPath) => path.join(pkgPath, "pkg-info.json"));

  for (const pkgInfoFile of pkgInfoFiles) {
    if (fs.existsSync(pkgInfoFile)) {
      // TODO: Nest another try-catch so we do not abort the entire thing
      //       on a single file failure.
      const pkgInfoData = JSON.parse(fs.readFileSync(pkgInfoFile, "utf-8"));
      await getLatestVersion(pkgInfoData, resolveLatestPkgVersions);
    } else {
      core.warning("Missing: " + pkgInfoFile);
    }
  }
}

function generatePkgInfoFiles(workspacePath: string) {
  // Get make to generate package info
  core.info("Generating pkg-info.json files...");
  const mkPkgInfo = child_process.spawnSync("make", [
    "-C",
    workspacePath,
    "pkg-info",
  ]);

  if (mkPkgInfo.error !== undefined) {
    throw mkPkgInfo.error;
  }
  core.info("Done");
}

async function getLatestVersion(
  pkgInfo: PkgInfo,
  resolveLatestPkgVersions: Resolver
) {
  const resolvedVersion = await resolveLatestPkgVersions(pkgInfo);

  if (resolvedVersion.kind === ResolvedVersionsKind.SUCCESS) {
    if (
      resolvedVersion.currentVersion !== resolvedVersion.latestVersionMajor ||
      resolvedVersion.currentVersion !== resolvedVersion.latestVersionMinor ||
      resolvedVersion.currentVersion !== resolvedVersion.latestVersionPatch
    ) {
      core.info(
        pkgInfo.PKG_NAME +
          " is OLD: " +
          resolvedVersion.currentVersion +
          " > " +
          resolvedVersion.latestVersionPatch +
          " => " +
          resolvedVersion.latestVersionMinor +
          " ==> " +
          resolvedVersion.latestVersionMajor
      );
    } else {
      core.info(pkgInfo.PKG_NAME + " is OK.");
    }
  } else {
    core.info(pkgInfo.PKG_NAME + " is UNKNOWN.");
  }
}
