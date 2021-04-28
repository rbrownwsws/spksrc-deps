// SPDX-License-Identifier: Apache-2.0

import { Version } from "./versionParsers";
import child_process, { SpawnSyncReturns } from "child_process";

export type PackagePatcher = (
  makefile: string,
  newVersion: Version
) => SpawnSyncReturns<string>;

export const patchPackage: PackagePatcher = (
  makefile: string,
  newVersion: Version
) => {
  return child_process.spawnSync("sed", [
    "-i",
    "s/^PKG_VERS\\s*=.*$/PKG_VERS = " + newVersion.displayVersion + "/",
    makefile,
  ]);
};
