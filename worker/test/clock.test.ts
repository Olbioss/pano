import { describe, expect, it, vi } from "vitest";
import { startMidWindow } from "./clock";

const HOUR = 60 * 60_000;

describe("startMidWindow", () => {
  it("moves the clock to the middle of the window that holds the real time", () => {
    const real = Date.now();
    startMidWindow(HOUR);
    const moved = Date.now();
    expect(moved % HOUR).toBeGreaterThanOrEqual(HOUR / 2);
    expect(moved % HOUR).toBeLessThan(HOUR / 2 + 1000);
    expect(Math.floor(moved / HOUR)).toBe(Math.floor(real / HOUR));
  });

  it("keeps the clock ticking from there", async () => {
    startMidWindow(HOUR);
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // It ticks a millisecond at a time, behind the real clock under load.
    expect(Date.now()).toBeGreaterThan(before);
  });

  it("puts the real clock back once the test is over", () => {
    expect(vi.isFakeTimers()).toBe(false);
  });
});
