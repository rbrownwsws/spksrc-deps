// SPDX-License-Identifier: Apache-2.0

interface ResolvedVersion {
  currentVersion: string;
  latestVersionMajor: string;
  latestVersionMinor: string;
  latestVersionPatch: string;
}

type Resolver = (pkgInfo: PkgInfo) => Promise<ResolvedVersion | null>;
