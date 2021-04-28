// SPDX-License-Identifier: Apache-2.0

import { VersionParser } from "./versionParser";
import { createMultiKindVersionParser } from "./multiKindVersionParser";
import { createConservativeNpmSemverVersionParser } from "./conservativeNpmSemverVersionParser";
import { createAggressiveNpmSemverVersionParser } from "./aggressiveNpmSemverVersionParser";

export const createDefaultVersionParser: () => VersionParser = () =>
  createMultiKindVersionParser([
    createConservativeNpmSemverVersionParser(),
    createAggressiveNpmSemverVersionParser(),
  ]);
