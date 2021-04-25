// SPDX-License-Identifier: Apache-2.0

import { Version, VersionParser } from "./versionParser";

export const createMultiKindVersionParser: (
  versionParsers: VersionParser[]
) => VersionParser = (versionParsers: VersionParser[]) => {
  // Create a map of version kinds to supporting parser
  // (prefer first parser for a given kind)
  const parserMap: Map<symbol, VersionParser> = new Map();
  for (const parser of versionParsers) {
    for (const kind of parser.getSupportedVersionKinds()) {
      if (!parserMap.has(kind)) {
        parserMap.set(kind, parser);
      }
    }
  }

  return {
    parse: (rawVersion: string) => {
      let version: Version | null = null;
      let parserIdx = 0;
      while (version === null && parserIdx < versionParsers.length) {
        version = versionParsers[parserIdx].parse(rawVersion);

        parserIdx++;
      }

      return version;
    },

    getSupportedVersionKinds: () => Array.from(parserMap.keys()),

    isAllowedAsMajorUpgrade: (oldVersion: Version, newVersion: Version) =>
      parserMap
        .get(oldVersion.kind)
        ?.isAllowedAsMajorUpgrade(oldVersion, newVersion) || false,

    isAllowedAsMinorUpgrade: (oldVersion: Version, newVersion: Version) =>
      parserMap
        .get(oldVersion.kind)
        ?.isAllowedAsMinorUpgrade(oldVersion, newVersion) || false,

    isAllowedAsPatchUpgrade: (oldVersion: Version, newVersion: Version) =>
      parserMap
        .get(oldVersion.kind)
        ?.isAllowedAsPatchUpgrade(oldVersion, newVersion) || false,
  };
};
