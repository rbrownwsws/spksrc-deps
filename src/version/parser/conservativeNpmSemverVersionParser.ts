// SPDX-License-Identifier: Apache-2.0

import semver from "semver";
import { VersionParser } from "./versionParser";
import { npmSemver } from "../kind";

export const createConservativeNpmSemverVersionParser: () => VersionParser = () => (
  rawVersion: string
) => {
  const parsedVersion = semver.valid(semver.clean(rawVersion));

  if (parsedVersion === null) {
    return null;
  } else {
    return {
      kind: npmSemver,
      rawVersion: rawVersion,
      displayVersion: parsedVersion,
    };
  }
};
