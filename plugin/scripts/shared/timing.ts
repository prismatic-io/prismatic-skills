/**
 * timing.ts — Timing utilities for skill scripts.
 */

const stepTimings: Array<[string, number]> = [];

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${Math.round(secs)}s`;
}

export function timedStep<T>(stepName: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const duration = (performance.now() - start) / 1000;
  stepTimings.push([stepName, duration]);
  return result;
}

export async function timedStepAsync<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const duration = (performance.now() - start) / 1000;
  stepTimings.push([stepName, duration]);
  return result;
}

export function printTimingSummary(): void {
  if (stepTimings.length === 0) return;
  const totalTime = stepTimings.reduce((sum, [, d]) => sum + d, 0);
  console.log("");
  console.log("Timing:");
  for (const [name, duration] of stepTimings) {
    console.log(`   ${name}: ${formatDuration(duration)}`);
  }
  console.log(`   Total: ${formatDuration(totalTime)}`);
}

export function clearTimings(): void {
  stepTimings.length = 0;
}
