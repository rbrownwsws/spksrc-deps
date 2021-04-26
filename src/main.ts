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
import { createResolver } from "./resolver";
import { runApp } from "./app";

async function main(): Promise<void> {
  try {
    // Get the workspace directory path
    const workspacePath = process.env.GITHUB_WORKSPACE;
    if (workspacePath === undefined) {
      throw { message: "GITHUB_WORKSPACE was not provided" };
    }

    // Get token for interacting with github api
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken === undefined) {
      throw { message: "GITHUB_TOKEN was not provided" };
    }
    const octokit = github.getOctokit(githubToken) as Octokit;

    // Prepare the release resolver
    const releaseIndexer = createMultiSourceReleaseIndexer([
      createGithubReleaseIndexer(octokit),
    ]);

    const versionParser = createMultiKindVersionParser([
      createNpmSemverVersionParser(),
    ]);

    const resolveLatestPkgVersions = createResolver(
      releaseIndexer,
      versionParser
    );

    // Run the app
    await runApp(
      workspacePath,
      githubToken,
      github.context.repo.owner,
      github.context.repo.repo,
      resolveLatestPkgVersions
    );
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
