// SPDX-License-Identifier: Apache-2.0
import { PkgInfo } from "./pkgInfo";
import { ReleaseIndexer } from "./releaseIndexers";
import { Version, VersionParser } from "./versionParsers";

export enum ResolvedVersionsKind {
  ERR_NO_INDEX = "ERR_NO_INDEX",
  ERR_UNSUPPORTED_VERSION_SYNTAX = "ERR_UNSUPPORTED_VERSION_SYNTAX",
  SUCCESS = "SUCCESS",
}

export interface ResolvedVersionsErr {
  kind:
    | ResolvedVersionsKind.ERR_NO_INDEX
    | ResolvedVersionsKind.ERR_UNSUPPORTED_VERSION_SYNTAX;
}

export interface ResolvedVersionsSuccess {
  kind: ResolvedVersionsKind.SUCCESS;
  currentVersion: Version;
  latestVersionMajor: Version;
  latestVersionMinor: Version;
  latestVersionPatch: Version;
}

export type ResolvedVersions = ResolvedVersionsSuccess | ResolvedVersionsErr;

export type Resolver = (pkgInfo: PkgInfo) => Promise<ResolvedVersions>;

export const createResolver: (
  releaseIndexer: ReleaseIndexer,
  versionParser: VersionParser
) => Resolver = (
  releaseIndexer: ReleaseIndexer,
  versionParser: VersionParser
) => async (pkgInfo: PkgInfo) => {
  // Clean up package version
  const currentVersion = versionParser.parse(pkgInfo.PKG_VERS);
  if (currentVersion === null) {
    return { kind: ResolvedVersionsKind.ERR_UNSUPPORTED_VERSION_SYNTAX };
  }

  // Get an index of releases
  const releaseIndex = await releaseIndexer(pkgInfo);

  // If we did not find a working index just return the error
  if (releaseIndex === null) {
    return { kind: ResolvedVersionsKind.ERR_NO_INDEX };
  }

  // Search for versions newer than the current version
  let newestMajorVersion = currentVersion;
  let newestMinorVersion = currentVersion;
  let newestPatchVersion = currentVersion;

  const releaseIterator = releaseIndex();
  let rawReleaseVersion = await releaseIterator.next();
  while (!rawReleaseVersion.done) {
    const releaseVersion = versionParser.parse(rawReleaseVersion.value);

    if (releaseVersion !== null) {
      if (
        versionParser.isAllowedAsMajorUpgrade(
          newestMajorVersion,
          releaseVersion
        )
      ) {
        newestMajorVersion = releaseVersion;
      }

      if (
        versionParser.isAllowedAsMinorUpgrade(
          newestMinorVersion,
          releaseVersion
        )
      ) {
        newestMinorVersion = releaseVersion;
      }

      if (
        versionParser.isAllowedAsPatchUpgrade(
          newestPatchVersion,
          releaseVersion
        )
      ) {
        newestPatchVersion = releaseVersion;
      }
    }

    rawReleaseVersion = await releaseIterator.next();
  }

  return {
    kind: ResolvedVersionsKind.SUCCESS,
    currentVersion: currentVersion,
    latestVersionMajor: newestMajorVersion,
    latestVersionMinor: newestMinorVersion,
    latestVersionPatch: newestPatchVersion,
  };
};
