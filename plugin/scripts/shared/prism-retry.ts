/**
 * prism-retry.ts — Reusable retry mechanism with exponential backoff + jitter.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { exec } from "../../vendor/tinyexec/main.mjs";

const NETWORK_ERROR_PATTERNS = [
  "enotfound",
  "econnrefused",
  "econnreset",
  "etimedout",
  "epipe",
  "socket hang up",
  "network error",
  "fetch failed",
  "dns resolution",
  "getaddrinfo",
];

const AUTH_ERROR_PATTERNS = [
  "not authenticated",
  "authentication failed",
  "invalid token",
  "token expired",
  "unauthorized",
  "403 forbidden",
  "login required",
  "prism login",
];

export const isNetworkError = (errorText: string): boolean => {
  const lower = errorText.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
};

export const isAuthError = (errorText: string): boolean => {
  const lower = errorText.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
};

const isRetryableError = (stderr: string): boolean => {
  const lower = stderr.toLowerCase();
  if (isAuthError(lower)) return false;
  if (lower.includes("404") || lower.includes("not found")) return false;
  if (lower.includes("validation") || lower.includes("invalid")) return false;
  if (isNetworkError(lower)) return true;
  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) return true;
  if (lower.includes("timeout")) return true;
  return false;
};

const calculateBackoff = (
  attempt: number,
  baseDelay = 1.0,
  maxDelay = 10.0,
  jitter = true,
): number => {
  let delay = baseDelay * 2 ** attempt;
  delay = Math.min(delay, maxDelay);
  if (jitter) {
    delay *= 0.5 + Math.random() * 0.5;
  }
  return delay;
};

export interface PrismResult {
  returncode: number;
  stdout: string;
  stderr: string;
}

export const runPrismCommand = async (
  command: string[],
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    showRetryFeedback?: boolean;
    timeout?: number;
    cwd?: string;
  } = {},
): Promise<PrismResult> => {
  const {
    maxAttempts = 5,
    baseDelay = 1.0,
    maxDelay = 10.0,
    showRetryFeedback = true,
    timeout = 30,
    cwd,
  } = options;

  let lastResult: PrismResult = { returncode: 1, stdout: "", stderr: "" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await exec(command[0], command.slice(1), {
        timeout: timeout * 1000,
        nodeOptions: { stdio: ["pipe", "pipe", "pipe"], cwd },
      });
      lastResult = {
        returncode: result.exitCode ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      lastResult = {
        returncode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }

    if (lastResult.returncode === 0) return lastResult;

    if (!isRetryableError(lastResult.stderr) || attempt === maxAttempts - 1) {
      return lastResult;
    }

    if (showRetryFeedback) {
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      console.error(`Retrying (${attempt + 1}/${maxAttempts}) in ${delay.toFixed(1)}s...`);
      await sleep(delay * 1000);
    }
  }

  return lastResult;
};

export const runPrismQuery = (command: string[], timeout = 30): Promise<PrismResult> => {
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 1.0,
    maxDelay: 10.0,
    timeout,
  });
};

export const runPrismMutation = (
  command: string[],
  options: { timeout?: number; cwd?: string } = {},
): Promise<PrismResult> => {
  const { timeout = 60, cwd } = options;
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 2.0,
    maxDelay: 20.0,
    timeout,
    cwd,
  });
};

export const runPrismDownload = (
  command: string[],
  options: { timeout?: number; cwd?: string } = {},
): Promise<PrismResult> => {
  const { timeout = 120, cwd } = options;
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 2.0,
    maxDelay: 30.0,
    timeout,
    cwd,
  });
};
