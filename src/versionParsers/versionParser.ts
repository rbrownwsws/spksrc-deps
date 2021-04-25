// SPDX-License-Identifier: Apache-2.0

export interface Version {
  readonly kind: symbol;
  readonly rawVersion: string;
  readonly displayVersion: string;
}

export interface VersionParser {
  parse: (rawVersion: string) => Version | null;

  getSupportedVersionKinds: () => symbol[];

  isAllowedAsMajorUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;

  isAllowedAsMinorUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;

  isAllowedAsPatchUpgrade: (
    oldVersion: Version,
    newVersion: Version
  ) => boolean;
}
