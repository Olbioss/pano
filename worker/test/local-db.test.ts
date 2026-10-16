import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "./local-db";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgresql://olbios@127.0.0.1:5432/pano_test",
    "postgresql://postgres:postgres@localhost:5432/pano_test",
    "postgres://someone@[::1]:5432/pano_test",
  ])("accepts %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow();
  });

  it.each([
    "postgresql://u:p@ep-quiet-sky-123456.eu-central-1.aws.neon.tech/neondb",
    "postgresql://u:p@10.0.0.5:5432/pano",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/not a local database/);
  });
});
