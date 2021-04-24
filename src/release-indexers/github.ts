// SPDX-License-Identifier: Apache-2.0

import { Octokit } from "@octokit/rest";
import semver from "semver";
import { ReleaseIndexer, ReleaseIndexKind } from "./release-indexer.js";

const githubRegex = /^https?:\/\/github.com\/([^\/]*)\/([^\/]*)\//;

const createGithubReleaseIndexer: (octokit: Octokit) => ReleaseIndexer = (
  octokit: Octokit
) => async (pkgInfo: PkgInfo) => {
  // Check if the package source is on github
  const matches = pkgInfo.PKG_DIST_SITE.match(githubRegex);
  if (matches === null) {
    return { kind: ReleaseIndexKind.UNSUPPORTED };
  }

  // Extract repo info from regex
  const pkgRepo = {
    owner: matches[1],
    repo: matches[2],
  };

  return {
    kind: ReleaseIndexKind.SUPPORTED,
    getReleaseIterator: async function* () {
      // FIXME: pagination
      const releases = await octokit.repos.listReleases(pkgRepo);
      for (const release of releases.data) {
        if (!release.draft && !release.prerelease) {
          const releaseVersion = semver.clean(release.tag_name);
          if (releaseVersion === null) {
            // Skip checking this release as it is not a valid semver version
            continue;
          }

          yield releaseVersion;
        }
      }
    },
  };
};

export { createGithubReleaseIndexer };
