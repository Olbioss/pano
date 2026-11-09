import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  isBreached,
  PBKDF2_ROUNDS,
  verifyPassword,
} from "./password";

describe("hashPassword", () => {
  it("stores the algorithm, the round count, a salt and the hash", async () => {
    expect(await hashPassword("correct horse")).toMatch(
      /^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/
    );
  });

  it("salts every hash, so the same password hashes differently", async () => {
    expect(await hashPassword("correct horse")).not.toBe(
      await hashPassword("correct horse")
    );
  });
});

describe("verifyPassword", () => {
  it("accepts the password a hash was made from", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      true
    );
  });

  it("refuses any other password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword({ hash, password: "correct horsf" })).toBe(
      false
    );
  });

  it("reads the round count from the hash, so it can be raised later", async () => {
    const hash = await hashPassword("correct horse", 1000);
    expect(hash).toContain("$1000$");
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      true
    );
  });

  it("treats the same text typed in either Unicode form as one password", async () => {
    // "ş" as one character, then as "s" plus a combining cedilla.
    const hash = await hashPassword("\u015fifre-g\u00fc\u00e7l\u00fc");
    expect(
      await verifyPassword({
        hash,
        password: "s\u0327ifre-gu\u0308c\u0327lu\u0308",
      })
    ).toBe(true);
  });

  it("refuses a tampered hash", async () => {
    const hash = await hashPassword("correct horse");
    // The hash's first character: all six of its bits are data, unlike the
    // last one's, whose low bits are padding.
    const at = hash.lastIndexOf("$") + 1;
    const swapped = hash[at] === "A" ? "Q" : "A";
    expect(
      await verifyPassword({
        hash: `${hash.slice(0, at)}${swapped}${hash.slice(at + 1)}`,
        password: "correct horse",
      })
    ).toBe(false);
  });

  it.each([
    "",
    "not a hash",
    "scrypt$100000$c2FsdA$aGFzaA",
    "pbkdf2-sha256$abc$c2FsdA$aGFzaA",
    "pbkdf2-sha256$0$c2FsdA$aGFzaA",
    `pbkdf2-sha256$${PBKDF2_ROUNDS + 1}$c2FsdA$aGFzaA`,
    "pbkdf2-sha256$1000$not base64!$aGFzaA",
    "pbkdf2-sha256$1000$c2FsdA$a",
    "pbkdf2-sha256$1000$c2FsdA",
  ])("refuses the malformed stored value %j without throwing", async (hash) => {
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      false
    );
  });
});

describe("isBreached", () => {
  afterEach(() => vi.unstubAllGlobals());

  // SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
  const PREFIX = "5BAA6";
  const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

  function stubRange(body: string, status = 200) {
    const fetch = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("sends only the first five characters of the SHA-1 hash", async () => {
    const fetch = stubRange(`${SUFFIX}:10434004\r\n`);
    await isBreached("password");
    expect(String(fetch.mock.calls[0]?.at(0))).toBe(
      `https://api.pwnedpasswords.com/range/${PREFIX}`
    );
  });

  it("is true for a password in the list", async () => {
    stubRange(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:10434004`);
    expect(await isBreached("password")).toBe(true);
  });

  it("is false for a password missing from the list, or listed as padding", async () => {
    stubRange(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:0`);
    expect(await isBreached("password")).toBe(false);
  });

  it("accepts the password, and logs it, when the service fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubRange("unavailable", 503);
    expect(await isBreached("password")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[auth] breach check unavailable")
    );
    warn.mockRestore();
  });

  it("accepts the password when the service can't be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    expect(await isBreached("password")).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
