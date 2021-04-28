// SPDX-License-Identifier: Apache-2.0

import { Octokit } from "@octokit/rest";
import core from "@actions/core";

export interface PullRequestInfo {
  head: string;
  title: string;
  body: string;
}

export interface Project {
  createPullRequest: (info: PullRequestInfo) => Promise<void>;
}

class GitHubProject implements Project {
  private readonly cooldown = 30000;

  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  public async createPullRequest(info: PullRequestInfo) {
    await this.octokit.rest.pulls.create({
      ...info,
      owner: this.owner,
      repo: this.repo,
      base: "master",
    });

    core.info(
      "Wait for " + this.cooldown + "ms to avoid GitHub abuse rate limit"
    );
    await new Promise((resolve) => setTimeout(resolve, this.cooldown));
  }
}

export function getGitHubProject(
  octokit: Octokit,
  owner: string,
  repo: string
): Project {
  return new GitHubProject(octokit, owner, repo);
}
