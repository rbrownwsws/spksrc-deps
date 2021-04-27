// SPDX-License-Identifier: Apache-2.0

import { Octokit } from "@octokit/rest";
import { PkgInfo } from "../pkgInfo";
import { Release, ReleaseIndexer } from "./releaseIndexer";

const githubRegex = /^https?:\/\/github.com\/([^/]*)\/([^/]*)\//;

export const createGithubReleaseIndexer: (
  octokit: Octokit
) => ReleaseIndexer = (octokit: Octokit) => async (pkgInfo: PkgInfo) => {
  // Check if the package source is on github
  const matches = pkgInfo.PKG_DIST_SITE.match(githubRegex);
  if (matches === null) {
    return null;
  }

  // Extract repo info from regex
  const pkgRepo = {
    owner: matches[1],
    repo: matches[2],
  };

  return async function* () {
    // For each page of releases
    for await (const response of octokit.paginate.iterator(
      octokit.repos.listReleases,
      pkgRepo
    )) {
      // For each release
      for (const githubRelease of response.data) {
        if (!githubRelease.draft && !githubRelease.prerelease) {
          const release: Release = {
            name: githubRelease.tag_name,
            artefacts: [],
          };

          for (const artefact of githubRelease.assets) {
            release.artefacts.push({
              name: artefact.name,
              downloadUrl: artefact.browser_download_url,
            });
          }

          yield release;
        }
      }
    }
  };
};
