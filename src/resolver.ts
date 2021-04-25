// SPDX-License-Identifier: Apache-2.0
import semver from "semver";
import {
  ReleaseIndexer,
  ReleaseIndex,
  ReleaseIndexKind,
} from "./release-indexers/release-indexer";

export enum ResolvedVersionsKind {
  ERR_NO_INDEXER = "ERR_NO_INDEXER",
  ERR_UNSUPPORTED_VERSION_SYNTAX = "ERR_UNSUPPORTED_VERSION_SYNTAX",
  SUCCESS = "SUCCESS",
}

export interface ResolvedVersionsErr {
  kind:
    | ResolvedVersionsKind.ERR_NO_INDEXER
    | ResolvedVersionsKind.ERR_UNSUPPORTED_VERSION_SYNTAX;
}

export interface ResolvedVersionsSuccess {
  kind: ResolvedVersionsKind.SUCCESS;
  currentVersion: string;
  latestVersionMajor: string;
  latestVersionMinor: string;
  latestVersionPatch: string;
}

export type ResolvedVersions = ResolvedVersionsSuccess | ResolvedVersionsErr;

export type Resolver = (pkgInfo: PkgInfo) => Promise<ResolvedVersions>;

export const createResolver: (releaseIndexers: ReleaseIndexer[]) => Resolver = (
  releaseIndexers: ReleaseIndexer[]
) => async (pkgInfo: PkgInfo) => {
  // Clean up package version
  const currentVersion = semver.valid(semver.coerce(pkgInfo.PKG_VERS));
  if (currentVersion === null) {
    return { kind: ResolvedVersionsKind.ERR_UNSUPPORTED_VERSION_SYNTAX };
  }

  // Iterate through indexers until we find one that works
  let releaseIndex: ReleaseIndex = { kind: ReleaseIndexKind.UNSUPPORTED };
  let indexerIdx = 0;
  while (
    releaseIndex.kind !== ReleaseIndexKind.SUPPORTED &&
    indexerIdx < releaseIndexers.length
  ) {
    releaseIndex = await releaseIndexers[indexerIdx](pkgInfo);

    indexerIdx++;
  }

  // If we did not find a working indexer just return the error
  if (releaseIndex.kind !== ReleaseIndexKind.SUPPORTED) {
    return { kind: ResolvedVersionsKind.ERR_NO_INDEXER };
  }

  // Search for versions newer than the current version
  const minorVersionSelector = "^" + currentVersion;
  const patchVersionSelector = "~" + currentVersion;

  let newestMajorVersion = currentVersion;
  let newestMinorVersion = currentVersion;
  let newestPatchVersion = currentVersion;

  const releaseIterator = releaseIndex.getReleaseIterator();
  let releaseVersion = await releaseIterator.next();
  while (!releaseVersion.done) {
    const cleanReleaseVersion = semver.valid(
      semver.coerce(releaseVersion.value)
    );

    if (cleanReleaseVersion !== null) {
      if (semver.gt(cleanReleaseVersion, newestMajorVersion)) {
        newestMajorVersion = cleanReleaseVersion;
      }

      if (
        semver.gt(cleanReleaseVersion, newestMinorVersion) &&
        semver.satisfies(cleanReleaseVersion, minorVersionSelector)
      ) {
        newestMinorVersion = cleanReleaseVersion;
      }

      if (
        semver.gt(cleanReleaseVersion, newestPatchVersion) &&
        semver.satisfies(cleanReleaseVersion, patchVersionSelector)
      ) {
        newestPatchVersion = cleanReleaseVersion;
      }
    }

    releaseVersion = await releaseIterator.next();
  }

  return {
    kind: ResolvedVersionsKind.SUCCESS,
    currentVersion: currentVersion,
    latestVersionMajor: newestMajorVersion,
    latestVersionMinor: newestMinorVersion,
    latestVersionPatch: newestPatchVersion,
  };
};
