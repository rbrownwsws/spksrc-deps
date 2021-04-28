// SPDX-License-Identifier: Apache-2.0

import { Version } from "../version";

export type VersionParser = (rawVersion: string) => Version | null;
