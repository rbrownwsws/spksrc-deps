// SPDX-License-Identifier: Apache-2.0

import semver from "semver";

import { Version } from "../version";
import { VersionComparator } from "./versionComparator";
import { npmSemver } from "../kind";

export const createNpmSemverVersionComparator: () => VersionComparator = () => {
  return {
    getSupportedVersionKinds: () => [npmSemver],

    isAllowedAsMajorUpgrade: (oldVersion: Version, newVersion: Version) =>
      semver.gt(newVersion.displayVersion, oldVersion.displayVersion),

    isAllowedAsMinorUpgrade: (oldVersion: Version, newVersion: Version) =>
      semver.gt(newVersion.displayVersion, oldVersion.displayVersion) &&
      semver.satisfies(
        newVersion.displayVersion,
        "^" + oldVersion.displayVersion
      ),

    isAllowedAsPatchUpgrade: (oldVersion: Version, newVersion: Version) =>
      semver.gt(newVersion.displayVersion, oldVersion.displayVersion) &&
      semver.satisfies(
        newVersion.displayVersion,
        "~" + oldVersion.displayVersion
      ),
  };
};
