import { onTestFinished, vi } from "vitest";

/**
 * Moves Date to the middle of the fixed window that holds the real time,
 * until the test ends. The clock keeps ticking from there, so a test that
 * fills a limit's window can't fail because the run crossed the top of the
 * hour, a ten-minute mark or UTC midnight. Timers stay real.
 */
export function startMidWindow(windowMs: number) {
  const now = Date.now();
  // A tick per millisecond, like the real clock: Better Auth takes the newest
  // of an address's codes by its time, so coarser ticks would tie them.
  vi.useFakeTimers({
    toFake: ["Date"],
    shouldAdvanceTime: true,
    advanceTimeDelta: 1,
  });
  vi.setSystemTime(Math.floor(now / windowMs) * windowMs + windowMs / 2);
  onTestFinished(() => {
    vi.useRealTimers();
  });
}
