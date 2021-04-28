// SPDX-License-Identifier: Apache-2.0

import { PackageInfo } from "./packageInfo";
import { ReleaseIndexer } from "./releaseIndexers";
import {
  createUpgradeResolver,
  UpgradePaths,
  UpgradePathsKind,
} from "./upgradeResolver";
import {
  createNpmSemverVersionComparator,
  createAggressiveNpmSemverVersionParser,
} from "./version";

function createDummyPkgInfo(): PackageInfo {
  return {
    PKG_NAME: "",
    PKG_VERS: "",
    PKG_EXT: "",
    PKG_DIST_NAME: "",
    PKG_DIST_SITE: "",
    PKG_DIR: "",
    PKG_DOWNLOAD_METHOD: "",
    PKG_GIT_HASH: "",
    URLS: "",
    DEPENDS: "",
  };
}

function createFakeReleaseIndexer(releaseVersions: string[]): ReleaseIndexer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (pkgInfo: PackageInfo) =>
    async function* () {
      for (const version of releaseVersions) {
        yield {
          name: version,
          artefacts: [],
        };
      }
    };
}

describe("Testing resolution", () => {
  describe("of SemVer", () => {
    /* Given */
    const indexer = createFakeReleaseIndexer([
      "1.0.0",
      "2.0.0",
      "2.3.4",
      "2.3.5",
      "2.4.0",
      "3.0.0",
      "4.0.0",
    ]);

    const resolve = createUpgradeResolver(
      indexer,
      createAggressiveNpmSemverVersionParser(),
      createNpmSemverVersionComparator()
    );
    const pkgInfo = { ...createDummyPkgInfo(), PKG_VERS: "2.3.4" };

    test("Major 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 4.0.0", async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.majorVersionUpgradeRelease.version.displayVersion).toBe(
        "4.0.0"
      );
    });

    test("Minor 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 2.4.0", async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.minorVersionUpgradeRelease.version.displayVersion).toBe(
        "2.4.0"
      );
    });

    test("Patch 2.3.4 vs [1.0.0, 2.0.0, 2.3.4, 2.3.5, 2.4.0, 3.0.0, 4.0.0] = 2.3.5", async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.patchVersionUpgradeRelease.version.displayVersion).toBe(
        "2.3.5"
      );
    });
  });
});
