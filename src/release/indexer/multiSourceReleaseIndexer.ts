// SPDX-License-Identifier: Apache-2.0

import { PackageInfo } from "../../packageInfo";
import { ReleaseIndexer, ReleaseIndex } from "./releaseIndexer";

export const createMultiSourceReleaseIndexer: (
  releaseIndexers: ReleaseIndexer[]
) => ReleaseIndexer = (releaseIndexers: ReleaseIndexer[]) => async (
  pkgInfo: PackageInfo
) => {
  // Iterate through indexers until we find one that works
  let releaseIndex: ReleaseIndex | null = null;
  let indexerIdx = 0;
  while (releaseIndex === null && indexerIdx < releaseIndexers.length) {
    releaseIndex = await releaseIndexers[indexerIdx](pkgInfo);

    indexerIdx++;
  }

  return releaseIndex;
};
