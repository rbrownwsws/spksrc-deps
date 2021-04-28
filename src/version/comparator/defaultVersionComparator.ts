// SPDX-License-Identifier: Apache-2.0

import { VersionComparator } from "./versionComparator";
import { createMultiKindVersionComparator } from "./multiKindVersionComparator";
import { createNpmSemverVersionComparator } from "./npmSemverVersionComparator";

export const createDefaultVersionComparator: () => VersionComparator = () =>
  createMultiKindVersionComparator([createNpmSemverVersionComparator()]);
