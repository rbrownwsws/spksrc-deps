// SPDX-License-Identifier: Apache-2.0

import { Octokit } from "@octokit/rest";
import { PkgInfo } from "../pkgInfo";
import { ReleaseIndexer, ReleaseIndexKind } from "./releaseIndexer";

const githubRegex = /^https?:\/\/github.com\/([^/]*)\/([^/]*)\//;

export const createGithubReleaseIndexer: (
  octokit: Octokit
) => ReleaseIndexer = (octokit: Octokit) => async (pkgInfo: PkgInfo) => {
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
      // For each page of releases
      for await (const response of octokit.paginate.iterator(
        octokit.repos.listReleases,
        pkgRepo
      )) {
        // For each release
        for (const release of response.data) {
          if (!release.draft && !release.prerelease) {
            yield release.tag_name;
          }
        }
      }
    },
  };
};
