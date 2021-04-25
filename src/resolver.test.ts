// SPDX-License-Identifier: Apache-2.0
import { ReleaseIndexer, ReleaseIndexKind } from "./release-indexers";
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

function createFakeReleaseIndexer(releaseVersions: string[]): ReleaseIndexer {
  return async (pkgInfo: PkgInfo) => {
    return {
      kind: ReleaseIndexKind.SUPPORTED,
      getReleaseIterator: async function* () {
        for (const version of releaseVersions) {
          yield version;
        }
      },
    };
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

describe("Testing resolution", () => {
  describe("of SemVer", () => {
    /* Given */
    const indexers: ReleaseIndexer[] = [
      createFakeReleaseIndexer([
        "1.0.0",
        "2.0.0",
        "2.3.4",
        "2.3.5",
        "2.4.0",
        "3.0.0",
        "4.0.0",
      ]),
    ];
    const resolve = createResolver(indexers);
    const pkgInfo = { ...createDummyPkgInfo(), PKG_VERS: "2.3.4" };

    test("Major 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 4.0.0", async () => {
      /* When */
      const result: ResolvedVersions = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(ResolvedVersionsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== ResolvedVersionsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.latestVersionMajor).toBe("4.0.0");
    });

    test("Minor 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 2.4.0", async () => {
      /* When */
      const result: ResolvedVersions = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(ResolvedVersionsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== ResolvedVersionsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.latestVersionMinor).toBe("2.4.0");
    });

    test("Patch 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 2.3.5", async () => {
      /* When */
      const result: ResolvedVersions = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(ResolvedVersionsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== ResolvedVersionsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.latestVersionPatch).toBe("2.3.5");
    });
  });
});
