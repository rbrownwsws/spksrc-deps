// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import { Octokit } from "@octokit/rest";

import * as child_process from "child_process";

import * as path from "path";
import * as fs from "fs";

import { createGithubReleaseIndexer } from "./release-indexers";
import { Resolver, createResolver, ResolvedVersionsKind } from "./resolver";

async function run(): Promise<void> {
  try {
    // Get the workspace directory path
    const workspacePath = process.env.GITHUB_WORKSPACE;
    if (workspacePath === undefined) {
      throw { message: "GITHUB_WORKSPACE was not provided" };
    }

    // FIXME: use an action input
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken === undefined) {
      throw { message: "GITHUB_TOKEN was not provided" };
    }
    const octokit = github.getOctokit(githubToken) as Octokit;

    const releaseIndexers = [createGithubReleaseIndexer(octokit)];
    const resolveLatestPkgVersions = createResolver(releaseIndexers);

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
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function getLatestVersion(
  pkgInfo: PkgInfo,
  resolveLatestPkgVersions: Resolver
) {
  let resolvedVersion = await resolveLatestPkgVersions(pkgInfo);

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

run();
