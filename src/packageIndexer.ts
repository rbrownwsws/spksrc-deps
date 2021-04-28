// SPDX-License-Identifier: Apache-2.0

import path from "path";
import fs from "fs";
import * as core from "@actions/core";

export interface PkgPath {
  prefix: string;
  dir: string;
  display: string;
}

export type PackageIndexer = (
  workspacePath: string,
  pkgPrefixes: string[]
) => PkgPath[];

export const defaultPackageIndexer: PackageIndexer = (
  workspacePath: string,
  pkgPrefixes: string[]
) => {
  const pkgPaths: PkgPath[] = [];

  // Find all the package directories
  for (const prefix of pkgPrefixes) {
    const fullPrefixPath = path.join(workspacePath, prefix);

    // Get all objects in dir
    fs.readdirSync(fullPrefixPath)
      // Turn the objects into PkgPath objects
      .map((name) => {
        return { prefix: prefix, dir: name, display: prefix + "/" + name };
      })
      // Filter out objects that are not directories
      .filter((pkgPath) =>
        fs.lstatSync(path.join(fullPrefixPath, pkgPath.dir)).isDirectory()
      )
      // Put objects into pkgPaths array
      .forEach((pkgPath) => {
        core.info("Found package: " + pkgPath.display);
        pkgPaths.push(pkgPath);
      });
  }

  return pkgPaths;
};
