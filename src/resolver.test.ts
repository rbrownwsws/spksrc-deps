// SPDX-License-Identifier: Apache-2.0
import { ReleaseIndexer } from "./release-indexers/release-indexer";
import {
  createResolver,
  ResolvedVersions,
  ResolvedVersionsKind,
} from "./resolver";

function createDummyPkgInfo(): PkgInfo {
  return {
    PKG_NAME: "",
    PKG_VERS: "",
    PKG_EXT: "",
    PKG_DIST_NAME: "",
    PKG_DIST_SITE: "",
    PKG_DIR: "",
    PKG_DOWNLOAD_METHOD: "",
    PKG_GIT_HASH: "",
  };
}

test("Trying to resolve with no indexer results in ERR_NO_INDEXER", async () => {
  /* Given */
  const indexers: ReleaseIndexer[] = [];
  const resolve = createResolver(indexers);
  const pkgInfo = { ...createDummyPkgInfo(), PKG_VERS: "1.0.0" };

  /* When */
  const result: ResolvedVersions = await resolve(pkgInfo);

  /* Then */
  expect(result.kind).toBe(ResolvedVersionsKind.ERR_NO_INDEXER);
});
