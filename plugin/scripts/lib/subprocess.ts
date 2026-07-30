/**
 * tinyexec surfaces AbortSignal timeouts as an AbortError whose cause is a
 * TimeoutError. Accept a direct TimeoutError as well for runtime portability.
 */
export const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "TimeoutError" ||
    (error.name === "AbortError" &&
      error.cause instanceof Error &&
      error.cause.name === "TimeoutError"));
