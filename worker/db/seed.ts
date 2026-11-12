// `bun run seed` rebuilds the demo workspace in the database DATABASE_URL
// names, exactly as the nightly cron does. With PANO_OWNER_EMAIL set, it
// also makes sure Pano's own board exists at /pano, owned by that person,
// and Rezerve's board at /rezerve, with that person on its team as an admin.
//
//   bun run seed                                  (the local database in .env)
//   DATABASE_URL=… PANO_OWNER_EMAIL=… bun run seed   (production, once)
import { resetDemo } from "../services/demo-reset";
import { ensurePanoBoard } from "../services/pano-board";
import { ensureRezerveBoard } from "../services/rezerve-board";
import { createDb } from "./client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

const { db, close } = createDb(url);
try {
  const demo = await resetDemo(db);
  console.log(
    `✓ demo: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
  );
  const ownerEmail = process.env.PANO_OWNER_EMAIL;
  if (ownerEmail) {
    await ensurePanoBoard(db, {
      ownerEmail,
      ownerName: process.env.PANO_OWNER_NAME,
    });
    console.log(`✓ pano: owned by ${ownerEmail}`);
    const rezerve = await ensureRezerveBoard(db, {
      adminEmail: ownerEmail,
      adminName: process.env.PANO_OWNER_NAME,
    });
    console.log(
      `✓ rezerve: run by ${ownerEmail}, ${rezerve.requests} starter requests added`
    );
  } else {
    console.log(
      "• pano and rezerve: skipped (set PANO_OWNER_EMAIL to create them)"
    );
  }
} finally {
  await close();
}
