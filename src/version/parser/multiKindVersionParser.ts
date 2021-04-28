// SPDX-License-Identifier: Apache-2.0

import { Version } from "../version";
import { VersionParser } from "./versionParser";

export const createMultiKindVersionParser: (
  versionParsers: VersionParser[]
) => VersionParser = (versionParsers: VersionParser[]) => (
  rawVersion: string
) => {
  let version: Version | null = null;
  let parserIdx = 0;
  while (version === null && parserIdx < versionParsers.length) {
    version = versionParsers[parserIdx](rawVersion);

    parserIdx++;
  }

  return version;
};
