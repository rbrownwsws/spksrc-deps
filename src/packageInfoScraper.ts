// SPDX-License-Identifier: Apache-2.0

import { PkgPath } from "./packageIndexer";
import { PackageInfo } from "./packageInfo";
import * as core from "@actions/core";
import { runMake } from "./makeRunner";
import path from "path";
import fs from "fs";

export interface Package {
  path: PkgPath;
  info: PackageInfo;
}

export type PackageInfoScraper = (
  workspacePath: string,
  pkgPaths: PkgPath[]
) => Package[];

export const defaultPackageInfoScraper: PackageInfoScraper = (
  workspacePath: string,
  pkgPaths: PkgPath[]
) => {
  core.info("Generating pkg-info.json files...");

  // Get make to generate package info
  const mkPkgInfo = runMake(workspacePath, "pkg-info");

  if (mkPkgInfo.error !== undefined) {
    throw mkPkgInfo.error;
  }

  core.info("Reading pkg-info.json files...");

  const packages: Package[] = [];

  // For each package
  for (const pkgPath of pkgPaths) {
    const pkgInfoFile = path.join(
      workspacePath,
      pkgPath.prefix,
      pkgPath.dir,
      "pkg-info.json"
    );

    // Check pkg-info.json file exists
    if (!fs.existsSync(pkgInfoFile)) {
      core.warning("Missing pkg-info.json for: " + pkgPath.display);

      continue;
    }

    // Try to read pkg-info.json file
    let rawPkgInfoData;
    try {
      rawPkgInfoData = fs.readFileSync(pkgInfoFile, "utf-8");
    } catch (error) {
      core.warning(
        "Error while trying to read pkg-info.json for: " +
          pkgPath.display +
          ": " +
          error
      );

      continue;
    }

    // Try to parse pkg-info.json file
    let pkgInfo: PackageInfo;
    try {
      pkgInfo = JSON.parse(rawPkgInfoData);
    } catch (error) {
      core.warning(
        "Error while trying to parse pkg-info.json for: " +
          pkgPath.display +
          ": " +
          error
      );

      continue;
    }

    // Store package info for later
    core.info("Got package info for: " + pkgPath.display);
    packages.push({
      path: pkgPath,
      info: pkgInfo,
    });
  }

  return packages;
};
