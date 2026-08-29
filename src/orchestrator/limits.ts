// SPDX-License-Identifier: Apache-2.0

/** Max JSON bytes of the user observation payload sent to the model. */
export const NC_OBSERVATION_MAX_BYTES = 256 * 1024;

/** Tool-loop ceiling per intent (including the successful commit). */
export const NC_LLM_DEFAULT_MAX_ROUNDS = 8;

export const NC_LLM_DEFAULT_MAX_TOKENS = 8192;

/** Overridable; hosts should pin the model they actually run. */
export const NC_DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
