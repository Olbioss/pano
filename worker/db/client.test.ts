import { createServer, type Server, type Socket } from "node:net";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";

// Accepts TCP connections and never answers: a database host that's up at the
// network level but stuck. postgres.js waits 30 s for it by default.
const sockets = new Set<Socket>();
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((socket) => {
    sockets.add(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  port = address.port;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("createDb", () => {
  it("gives up on a database that never answers", async () => {
    const { db, close } = createDb(
      `postgresql://nobody:x@127.0.0.1:${port}/none`,
      { connectTimeoutSeconds: 1 }
    );
    const started = Date.now();
    await expect(db.execute(sql`select 1`)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    await close();
  });
});
