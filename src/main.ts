// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import { Octokit } from "@octokit/rest";

import {
  createMultiSourceReleaseIndexer,
  createGithubReleaseIndexer,
} from "./releaseIndexers";
import {
  createMultiKindVersionParser,
  createNpmSemverVersionParser,
} from "./versionParsers";
import { createUpgradeResolver } from "./upgradeResolver";
import { runApp } from "./app";
import { patchPackage } from "./packagePatcher";
import { defaultPackageIndexer } from "./packageIndexer";
import { defaultPackageInfoScraper } from "./packageInfoScraper";
import { createGitVcs } from "./vcs";
import { getGitHubProject } from "./project";

async function main(): Promise<void> {
  try {
    // Get the workspace directory path
    const workspacePath = process.env.GITHUB_WORKSPACE;
    if (workspacePath === undefined) {
      core.setFailed("GITHUB_WORKSPACE was not provided");
      return;
    }

    // Get token for interacting with github api
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken === undefined) {
      core.setFailed("GITHUB_TOKEN was not provided");
      return;
    }
    const octokit = github.getOctokit(githubToken) as Octokit;

    // Prepare the release resolver
    const releaseIndexer = createMultiSourceReleaseIndexer([
      createGithubReleaseIndexer(octokit),
    ]);

    const versionParser = createMultiKindVersionParser([
      createNpmSemverVersionParser(),
    ]);

    const resolveLatestPkgVersions = createUpgradeResolver(
      releaseIndexer,
      versionParser
    );

    // Run the app
    await runApp({
      workspacePath,
      findPackages: defaultPackageIndexer,
      getPackageInfo: defaultPackageInfoScraper,
      resolveLatestPkgVersions,
      getVcs: createGitVcs,
      patchPackage,
      project: getGitHubProject(
        octokit,
        github.context.repo.owner,
        github.context.repo.repo
      ),
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
