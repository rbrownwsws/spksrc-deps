// SPDX-License-Identifier: Apache-2.0

import { PackageInfo } from "../../packageInfo";

export interface ReleaseArtefact {
  name: string;
  downloadUrl: string;
}

export interface Release {
  name: string;
  artefacts: ReleaseArtefact[];
}

export type ReleaseIndex = () => AsyncIterator<Release, void, void>;

export type ReleaseIndexer = (
  pkgInfo: PackageInfo
) => Promise<ReleaseIndex | null>;
