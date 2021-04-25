// SPDX-License-Identifier: Apache-2.0

import { PkgInfo } from "../pkgInfo";

export type ReleaseIndex = () => AsyncIterator<string, void, void>;

export type ReleaseIndexer = (pkgInfo: PkgInfo) => Promise<ReleaseIndex | null>;
