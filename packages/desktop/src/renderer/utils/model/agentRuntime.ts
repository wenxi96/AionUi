/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type AgentNativeRuntimeMetadata = {
  kind: 'native';
  platform?: string;
};

export type AgentWslRuntimeMetadata = {
  kind: 'wsl';
  distro: string;
  version?: 1 | 2;
  state?: 'Running' | 'Stopped' | string;
  cliPath?: string;
  pathEnv?: string;
  detectedAt?: number;
  probeMode?: 'clean-bash' | 'login-shell' | 'user-shell' | 'manual';
};

export type AgentUnknownRuntimeMetadata = {
  kind: string;
  [key: string]: unknown;
};

export type AgentRuntimeWireMetadata =
  | AgentNativeRuntimeMetadata
  | AgentWslRuntimeMetadata
  | AgentUnknownRuntimeMetadata;

export function isWslRuntime(runtime: AgentRuntimeWireMetadata | undefined): runtime is AgentWslRuntimeMetadata {
  return runtime?.kind === 'wsl';
}
