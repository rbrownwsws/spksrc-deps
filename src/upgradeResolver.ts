// SPDX-License-Identifier: Apache-2.0

import { PkgInfo } from "./pkgInfo";
import { Release, ReleaseIndexer } from "./releaseIndexers";
import { Version, VersionParser } from "./versionParsers";

export interface VersionedRelease {
  version: Version;
  release: Release;
}

export enum UpgradePathsKind {
  ERR_NO_INDEX = "ERR_NO_INDEX",
  ERR_UNSUPPORTED_VERSION_SYNTAX = "ERR_UNSUPPORTED_VERSION_SYNTAX",
  SUCCESS = "SUCCESS",
}

export interface UpgradePathsErr {
  kind:
    | UpgradePathsKind.ERR_NO_INDEX
    | UpgradePathsKind.ERR_UNSUPPORTED_VERSION_SYNTAX;
}

export interface UpgradePathsSuccess {
  kind: UpgradePathsKind.SUCCESS;
  currentVersionRelease: VersionedRelease;
  majorVersionUpgradeRelease: VersionedRelease;
  minorVersionUpgradeRelease: VersionedRelease;
  patchVersionUpgradeRelease: VersionedRelease;
}

export type UpgradePaths = UpgradePathsSuccess | UpgradePathsErr;

export type UpgradeResolver = (pkgInfo: PkgInfo) => Promise<UpgradePaths>;

export const createUpgradeResolver: (
  releaseIndexer: ReleaseIndexer,
  versionParser: VersionParser
) => UpgradeResolver = (
  releaseIndexer: ReleaseIndexer,
  versionParser: VersionParser
) => async (pkgInfo: PkgInfo) => {
  // Clean up package version
  const currentVersion = versionParser.parse(pkgInfo.PKG_VERS);
  if (currentVersion === null) {
    return { kind: UpgradePathsKind.ERR_UNSUPPORTED_VERSION_SYNTAX };
  }

  // Create a temporary currentVersionRelease until we can make the real one
  const currentVersionRelease: VersionedRelease = {
    version: currentVersion,
    release: {
      name: pkgInfo.PKG_VERS,
      artefacts: [],
    },
  };

  const upgradePaths: UpgradePathsSuccess = {
    kind: UpgradePathsKind.SUCCESS,
    currentVersionRelease: currentVersionRelease,
    majorVersionUpgradeRelease: currentVersionRelease,
    minorVersionUpgradeRelease: currentVersionRelease,
    patchVersionUpgradeRelease: currentVersionRelease,
  };

  // Get an index of releases
  const releaseIndex = await releaseIndexer(pkgInfo);

  // If we did not find a working index just return the error
  if (releaseIndex === null) {
    return { kind: UpgradePathsKind.ERR_NO_INDEX };
  }

  // Search for versions newer than the current version
  const releaseIterator = releaseIndex();
  let release = await releaseIterator.next();
  while (!release.done) {
    const releaseVersion = versionParser.parse(release.value.name);

    // TODO: Warn about versions we cannot parse?

    // Check if this is the release we are currently using
    if (
      release.value.artefacts.some(
        (artefact) => artefact.downloadUrl === pkgInfo.URLS
      )
    ) {
      upgradePaths.currentVersionRelease.release = release.value;
    }

    // See if this release is a better candidate for any upgrade path
    if (releaseVersion !== null) {
      const versionedRelease: VersionedRelease = {
        version: releaseVersion,
        release: release.value,
      };

      if (
        versionParser.isAllowedAsMajorUpgrade(
          upgradePaths.majorVersionUpgradeRelease.version,
          versionedRelease.version
        )
      ) {
        upgradePaths.majorVersionUpgradeRelease = versionedRelease;
      }

      if (
        versionParser.isAllowedAsMinorUpgrade(
          upgradePaths.minorVersionUpgradeRelease.version,
          versionedRelease.version
        )
      ) {
        upgradePaths.minorVersionUpgradeRelease = versionedRelease;
      }

      if (
        versionParser.isAllowedAsPatchUpgrade(
          upgradePaths.patchVersionUpgradeRelease.version,
          versionedRelease.version
        )
      ) {
        upgradePaths.patchVersionUpgradeRelease = versionedRelease;
      }
    }

    release = await releaseIterator.next();
  }

  return upgradePaths;
};
