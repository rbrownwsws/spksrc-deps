// SPDX-License-Identifier: Apache-2.0

import { PackageInfo } from "./packageInfo";
import { ReleaseIndexer } from "./release";
import {
  createUpgradeResolver,
  UpgradePaths,
  UpgradePathsKind,
} from "./upgradeResolver";
import {
  createDefaultVersionComparator,
  createDefaultVersionParser,
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

interface TargetVersions {
  current: string;
  majorTarget: string;
  minorTarget: string;
  patchTarget: string;
}

function resolverTest(availableVersions: string[], target: TargetVersions) {
  /* Given */
  const indexer = createFakeReleaseIndexer(availableVersions);
  const resolve = createUpgradeResolver(
    indexer,
    createDefaultVersionParser(),
    createDefaultVersionComparator()
  );
  const pkgInfo = { ...createDummyPkgInfo(), PKG_VERS: target.current };

  test(
    target.current +
      " MAJOR upgrade from [" +
      availableVersions +
      "] = " +
      target.majorTarget,
    async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.majorVersionUpgradeRelease.version.displayVersion).toBe(
        target.majorTarget
      );
    }
  );

  test(
    target.current +
      " MINOR upgrade from [" +
      availableVersions +
      "] = " +
      target.minorTarget,
    async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.minorVersionUpgradeRelease.version.displayVersion).toBe(
        target.minorTarget
      );
    }
  );

  test(
    target.current +
      " PATCH upgrade from [" +
      availableVersions +
      "] = " +
      target.patchTarget,
    async () => {
      /* When */
      const result: UpgradePaths = await resolve(pkgInfo);

      /* Then */
      expect(result.kind).toBe(UpgradePathsKind.SUCCESS);

      // Force TS to be happy
      if (result.kind !== UpgradePathsKind.SUCCESS) {
        throw "Something has gone very wrong";
      }

      expect(result.patchVersionUpgradeRelease.version.displayVersion).toBe(
        target.patchTarget
      );
    }
  );
}

describe("Testing resolution", () => {
  describe("of clean SemVer [x.y.z]", () => {
    resolverTest(
      ["4.0.0", "3.0.0", "2.4.0", "2.3.5", "2.3.4", "2.0.0", "1.0.0"],
      {
        current: "2.3.4",
        majorTarget: "4.0.0",
        minorTarget: "2.4.0",
        patchTarget: "2.3.5",
      }
    );
  });

  describe('of "v" prefixed SemVer [vx.y.z]', () => {
    resolverTest(
      ["v4.0.0", "v3.0.0", "v2.4.0", "v2.3.5", "v2.3.4", "v2.0.0", "v1.0.0"],
      {
        current: "2.3.4",
        majorTarget: "4.0.0",
        minorTarget: "2.4.0",
        patchTarget: "2.3.5",
      }
    );
  });

  describe("of name prefixed SemVer [prefix-x.y.z]", () => {
    resolverTest(
      [
        "OTP-4.0.0",
        "OTP-3.0.0",
        "OTP-2.4.0",
        "OTP-2.3.5",
        "OTP-2.3.4",
        "OTP-2.0.0",
        "OTP-1.0.0",
      ],
      {
        current: "2.3.4",
        majorTarget: "4.0.0",
        minorTarget: "2.4.0",
        patchTarget: "2.3.5",
      }
    );
  });

  // Skip by default because we know it does not work yet
  describe.skip("of four dotted versions [x.y.z.n]", () => {
    resolverTest(
      [
        "0.8.1.213",
        "0.8.0.2042",
        "0.8.0.2041",
        "0.7.2.1878",
        "0.7.1.1400",
        "0.7.1.1381",
        "0.7.0.1347",
        "0.6.2.883",
        "0.6.1.830",
      ],
      {
        current: "0.7.1.1381",
        majorTarget: "0.8.1.213",
        minorTarget: "0.7.2.1878",
        patchTarget: "0.7.1.1400",
      }
    );
  });

  // Skip by default because we know it does not work yet
  describe.skip('of "v" prefixed four dotted versions [vx.y.z.n]', () => {
    resolverTest(
      [
        "v0.8.1.213",
        "v0.8.0.2042",
        "v0.8.0.2041",
        "v0.7.2.1878",
        "v0.7.1.1400",
        "v0.7.1.1381",
        "v0.7.0.1347",
        "v0.6.2.883",
        "v0.6.1.830",
      ],
      {
        current: "0.7.1.1381",
        majorTarget: "0.8.1.213",
        minorTarget: "0.7.2.1878",
        patchTarget: "0.7.1.1400",
      }
    );
  });

  // Skip by default because we know it does not work yet
  describe.skip("of 2 dotted versions with alpha patch (tmux) [x.ya]", () => {
    resolverTest(
      [
        "3.1c",
        "3.1b",
        "3.1a",
        "3.1",
        "3.0a",
        "3.0",
        "2.9a",
        "2.9",
        "2.8a",
        "2.8",
      ],
      {
        current: "2.8",
        majorTarget: "3.1c",
        minorTarget: "2.9a",
        patchTarget: "2.8a",
      }
    );
  });

  // TODO: Find out what's the difference between an x.y.Z-n and x.y.z-N upgrade
  // Skip by default because we know it does not work yet
  describe.skip("of 3 dotted, 1 dash versions (ImageMagick) [x.y.z-n]", () => {
    resolverTest(["7.0.11-6", "6.1.0-0", "6.0.1-0", "6.0.0-3", "6.0.0-2"], {
      current: "6.0.0-2",
      majorTarget: "7.0.11-6",
      minorTarget: "6.1.0-0",
      patchTarget: "6.0.1-0",
    });
  });
});
