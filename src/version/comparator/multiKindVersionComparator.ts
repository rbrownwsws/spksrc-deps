// SPDX-License-Identifier: Apache-2.0

import { Version } from "../version";
import { VersionComparator } from "./versionComparator";

export const createMultiKindVersionComparator: (
  versionComparators: VersionComparator[]
) => VersionComparator = (versionComparators: VersionComparator[]) => {
  // Create a map of version kinds to supporting comparator
  const comparatorMap: Map<symbol, VersionComparator> = new Map();
  for (const parser of versionComparators) {
    for (const kind of parser.getSupportedVersionKinds()) {
      if (!comparatorMap.has(kind)) {
        comparatorMap.set(kind, parser);
      }
    }
  }

  return {
    getSupportedVersionKinds: () => Array.from(comparatorMap.keys()),

    isAllowedAsMajorUpgrade: (oldVersion: Version, newVersion: Version) =>
      comparatorMap
        .get(oldVersion.kind)
        ?.isAllowedAsMajorUpgrade(oldVersion, newVersion) || false,

    isAllowedAsMinorUpgrade: (oldVersion: Version, newVersion: Version) =>
      comparatorMap
        .get(oldVersion.kind)
        ?.isAllowedAsMinorUpgrade(oldVersion, newVersion) || false,

    isAllowedAsPatchUpgrade: (oldVersion: Version, newVersion: Version) =>
      comparatorMap
        .get(oldVersion.kind)
        ?.isAllowedAsPatchUpgrade(oldVersion, newVersion) || false,
  };
};
