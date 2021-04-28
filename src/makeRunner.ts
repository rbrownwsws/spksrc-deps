// SPDX-License-Identifier: Apache-2.0

import child_process, { SpawnSyncReturns } from "child_process";

export type MakeRunner = (
  dir: string,
  target: string
) => SpawnSyncReturns<string>;

export const runMake: MakeRunner = (dir: string, target: string) => {
  return child_process.spawnSync("make", ["-C", dir, target]);
};
