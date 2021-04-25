// SPDX-License-Identifier: Apache-2.0

import semver from "semver";
import { Version, VersionParser } from "./versionParser";

const npmSemverSymbol = Symbol();

export const createNpmSemverVersionParser: () => VersionParser = () => {
  return {
    parse: (rawVersion: string) => {
      const parsedVersion = semver.valid(semver.coerce(rawVersion));

      if (parsedVersion === null) {
        return null;
      } else {
        return {
          kind: npmSemverSymbol,
          rawVersion: rawVersion,
          displayVersion: parsedVersion,
        };
      }
    },

    getSupportedVersionKinds: () => [npmSemverSymbol],

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
