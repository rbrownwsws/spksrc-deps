export enum ReleaseIndexKind {
  UNSUPPORTED,
  SUPPORTED,
}

export interface ReleaseIndexUnsupported {
  kind: ReleaseIndexKind.UNSUPPORTED;
}

export interface ReleaseIndexSupported {
  kind: ReleaseIndexKind.SUPPORTED;
  getReleaseIterator: () => AsyncIterator<string, void, void>;
}

export type ReleaseIndex = ReleaseIndexUnsupported | ReleaseIndexSupported;

export type ReleaseIndexer = (pkgInfo: PkgInfo) => Promise<ReleaseIndex>;
