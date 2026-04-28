/**
 * prism-retry.ts — Reusable retry mechanism with exponential backoff + jitter.
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";

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

export function isNetworkError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
}

export function isAuthError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

function isRetryableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  if (isAuthError(lower)) return false;
  if (lower.includes("404") || lower.includes("not found")) return false;
  if (lower.includes("validation") || lower.includes("invalid")) return false;
  if (isNetworkError(lower)) return true;
  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) return true;
  if (lower.includes("timeout")) return true;
  return false;
}

function calculateBackoff(
  attempt: number,
  baseDelay = 1.0,
  maxDelay = 10.0,
  jitter = true,
): number {
  let delay = baseDelay * 2 ** attempt;
  delay = Math.min(delay, maxDelay);
  if (jitter) {
    delay *= 0.5 + Math.random() * 0.5;
  }
  return delay;
}

function sleep(seconds: number): void {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    // busy wait — spawnSync blocks anyway, this is fine for CLI scripts
  }
}

export interface PrismResult {
  returncode: number;
  stdout: string;
  stderr: string;
}

export function runPrismCommand(
  command: string[],
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    showRetryFeedback?: boolean;
    timeout?: number;
    cwd?: string;
  } = {},
): PrismResult {
  const {
    maxAttempts = 5,
    baseDelay = 1.0,
    maxDelay = 10.0,
    showRetryFeedback = true,
    timeout = 30,
    cwd,
  } = options;

  let lastResult: SpawnSyncReturns<string> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = spawnSync(command[0], command.slice(1), {
      encoding: "utf-8",
      timeout: timeout * 1000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
    });

    if (lastResult.status === 0) {
      return {
        returncode: 0,
        stdout: lastResult.stdout ?? "",
        stderr: lastResult.stderr ?? "",
      };
    }

    const stderr = lastResult.stderr ?? "";
    if (!isRetryableError(stderr) || attempt === maxAttempts - 1) {
      return {
        returncode: lastResult.status ?? 1,
        stdout: lastResult.stdout ?? "",
        stderr,
      };
    }

    if (showRetryFeedback) {
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      console.error(`Retrying (${attempt + 1}/${maxAttempts}) in ${delay.toFixed(1)}s...`);
      sleep(delay);
    }
  }

  return {
    returncode: lastResult?.status ?? 1,
    stdout: lastResult?.stdout ?? "",
    stderr: lastResult?.stderr ?? "",
  };
}

export function runPrismQuery(command: string[], timeout = 30): PrismResult {
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 1.0,
    maxDelay: 10.0,
    timeout,
  });
}

export function runPrismMutation(
  command: string[],
  options: { timeout?: number; cwd?: string } = {},
): PrismResult {
  const { timeout = 60, cwd } = options;
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 2.0,
    maxDelay: 20.0,
    timeout,
    cwd,
  });
}

export function runPrismDownload(
  command: string[],
  options: { timeout?: number; cwd?: string } = {},
): PrismResult {
  const { timeout = 120, cwd } = options;
  return runPrismCommand(command, {
    maxAttempts: 5,
    baseDelay: 2.0,
    maxDelay: 30.0,
    timeout,
    cwd,
  });
}
