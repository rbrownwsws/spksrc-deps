// SPDX-License-Identifier: Apache-2.0

import { Version } from "../version";

export interface VersionComparator {
  getSupportedVersionKinds: () => symbol[];

  isAllowedAsMajorUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;

  isAllowedAsMinorUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;

  isAllowedAsPatchUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;
}
