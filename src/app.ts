// SPDX-License-Identifier: Apache-2.0

import * as core from "@actions/core";
import * as github from "@actions/github";

import * as child_process from "child_process";

import * as path from "path";
import * as fs from "fs";

import {
  ResolvedVersionsKind,
  ResolvedVersionsSuccess,
  Resolver,
} from "./resolver";
import { PkgInfo } from "./pkgInfo";

interface PkgPath {
  prefix: string;
  dir: string;
  display: string;
}

interface Package {
  path: PkgPath;
  info: PkgInfo;
}

interface UpdatablePackage {
  pkg: Package;
  version: ResolvedVersionsSuccess;
}

export async function runApp(
  workspacePath: string,
  githubToken: string,
  resolveLatestPkgVersions: Resolver
): Promise<void> {
  core.startGroup("Find package paths");
  const pkgPrefixes = ["cross", "native"];
  const pkgPaths = findPackagePaths(workspacePath, pkgPrefixes);
  core.endGroup();

  core.startGroup("Generate pkg-info.json files");
  generatePkgInfoFiles(workspacePath);
  core.endGroup();

  core.startGroup("Read package info");
  const packages = getPackageInfo(workspacePath, pkgPaths);
  core.endGroup();

  core.startGroup("Resolve latest package versions");
  const updatablePackages = await getUpdatablePackages(
    packages,
    resolveLatestPkgVersions
  );
  core.endGroup();
}

function findPackagePaths(workspacePath: string, pkgPrefixes: string[]) {
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
}

function generatePkgInfoFiles(workspacePath: string) {
  // Get make to generate package info
  const mkPkgInfo = child_process.spawnSync("make", [
    "-C",
    workspacePath,
    "pkg-info",
  ]);

  if (mkPkgInfo.error !== undefined) {
    throw mkPkgInfo.error;
  }
}

function getPackageInfo(workspacePath: string, pkgPaths: PkgPath[]): Package[] {
  const packages: Package[] = [];

  for (const pkgPath of pkgPaths) {
    const pkgInfoFile = path.join(
      workspacePath,
      pkgPath.prefix,
      pkgPath.dir,
      "pkg-info.json"
    );

    if (!fs.existsSync(pkgInfoFile)) {
      core.warning("Missing pkg-info.json for: " + pkgPath.display);

      continue;
    }

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

    let pkgInfo: PkgInfo;
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

    core.info("Got package info for: " + pkgPath.display);
    packages.push({
      path: pkgPath,
      info: pkgInfo,
    });
  }

  return packages;
}

async function getUpdatablePackages(
  packages: Package[],
  resolveLatestPkgVersions: Resolver
) {
  const updatablePackages: UpdatablePackage[] = [];

  for (const pkg of packages) {
    const resolvedVersion = await resolveLatestPkgVersions(pkg.info);

    if (resolvedVersion.kind === ResolvedVersionsKind.SUCCESS) {
      if (
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionMajor.displayVersion ||
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionMinor.displayVersion ||
        resolvedVersion.currentVersion.displayVersion !==
          resolvedVersion.latestVersionPatch.displayVersion
      ) {
        core.info(
          pkg.path.display +
            " is OLD: [" +
            resolvedVersion.currentVersion.displayVersion +
            "] > " +
            resolvedVersion.latestVersionPatch.displayVersion +
            " >> " +
            resolvedVersion.latestVersionMinor.displayVersion +
            " >>> " +
            resolvedVersion.latestVersionMajor.displayVersion
        );
        updatablePackages.push({
          pkg: pkg,
          version: resolvedVersion,
        });
      } else {
        core.info(pkg.path.display + " is UP-TO-DATE.");
      }
    } else {
      core.info(pkg.path.display + " is UNKNOWN.");
    }
  }
}
