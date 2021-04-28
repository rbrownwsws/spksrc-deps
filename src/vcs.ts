// SPDX-License-Identifier: Apache-2.0

import simpleGit, { BranchSummary, ResetMode, SimpleGit } from "simple-git";

export interface Vcs {
  hasBranch: (branchName: string) => boolean;
  startNewPatch: (branchName: string) => Promise<void>;
  abortPatch: () => Promise<void>;
  addFileToPatch: (file: string) => Promise<void>;
  finishPatch: (message: string) => Promise<void>;
  pushPatch: (branchName: string) => Promise<void>;
  reset: () => Promise<void>;
}

class GitVcs implements Vcs {
  private readonly git: SimpleGit;
  private readonly initialBranches: string[];
  private readonly originalBranch: string;

  constructor(git: SimpleGit, initialBranches: BranchSummary) {
    this.git = git;
    this.initialBranches = initialBranches.all;
    this.originalBranch = initialBranches.current;
  }

  public hasBranch(branchName: string) {
    return this.initialBranches.some(
      (existingBranch) => existingBranch === branchName
    );
  }

  public async startNewPatch(branchName: string) {
    await this.git.checkout(["-b", branchName, this.originalBranch]);
  }

  public async abortPatch() {
    const patchBranch = (await this.git.branchLocal()).current;
    await this.git.reset(ResetMode.HARD);
    await this.reset();
    await this.git.deleteLocalBranch(patchBranch);
  }

  public async addFileToPatch(file: string) {
    await this.git.add(file);
  }

  public async finishPatch(message: string) {
    await this.git.commit(message);
  }

  public async pushPatch(branchName: string) {
    await this.git.push("origin", branchName);
  }

  public async reset() {
    await this.git.checkout(this.originalBranch);
  }
}

export type VcsFactory = (workspace: string) => Promise<Vcs>;

export const createGitVcs: VcsFactory = async (workspace: string) => {
  const git: SimpleGit = simpleGit(workspace);

  // Set up basic git config
  await git.addConfig("user.name", "spksrc-deps");
  await git.addConfig("user.email", "spksrc-deps@synocommunity.github.io");

  // Make sure we have all the remote branches, not just the one we cloned.
  await git.fetch();

  // Get the initial branches for later reference
  const initialBranches = await git.branch();

  return new GitVcs(git, initialBranches);
};
