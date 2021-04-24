// SPDX-License-Identifier: Apache-2.0

import { Octokit } from "@octokit/rest";
import semver from "semver";

const githubRegex = /^https?:\/\/github.com\/([^\/]*)\/([^\/]*)\//;

const createGithubResolver: (octokit: Octokit) => Resolver = (
  octokit: Octokit
) => async (pkgInfo: PkgInfo) => {
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

  // Clean up the current version and create version selectors
  // FIXME: check for null after clean
  const currentVersion = semver.clean(pkgInfo.PKG_VERS);

  if (currentVersion === null) {
    // FIXME: Extra return types to provide more info
    return null;
  }

  const minorVersionSelector = "^" + currentVersion;
  const patchVersionSelector = "~" + currentVersion;

  let newestMajorVersion = currentVersion;
  let newestMinorVersion = currentVersion;
  let newestPatchVersion = currentVersion;

  // FIXME: keep looking through pages for the best minor/patch version if we
  //        are really out of date
  const releases = await octokit.repos.listReleases(pkgRepo);
  for (const release of releases.data) {
    const releaseVersion = semver.clean(release.tag_name);
    if (releaseVersion === null) {
      // Skip checking this release as it is not a valid semver version
      continue;
    }

    if (
      !release.draft &&
      !release.prerelease &&
      semver.gt(releaseVersion, currentVersion)
    ) {
      if (semver.gt(releaseVersion, newestMajorVersion)) {
        newestMajorVersion = releaseVersion;
      }

      if (
        semver.gt(releaseVersion, newestMinorVersion) &&
        semver.satisfies(releaseVersion, minorVersionSelector)
      ) {
        newestMinorVersion = releaseVersion;
      }

      if (
        semver.gt(releaseVersion, newestPatchVersion) &&
        semver.satisfies(releaseVersion, patchVersionSelector)
      ) {
        newestPatchVersion = releaseVersion;
      }
    }
  }

  return {
    currentVersion: currentVersion,
    latestVersionMajor: newestMajorVersion,
    latestVersionMinor: newestMinorVersion,
    latestVersionPatch: newestPatchVersion,
  };
};

export { createGithubResolver };
