import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  boards,
  member,
  organization,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { cleanDisplayName } from "../lib/display-name";

/** Pano's own feedback board lives at /pano. Fixed, so a re-run finds it. */
export const PANO_WORKSPACE_ID = "org_pano";

const PANO_BOARDS = [
  { slug: "features", name: "Features" },
  { slug: "bugs", name: "Bugs" },
];

/**
 * Makes sure Pano's own workspace exists at /pano, owned by the person who
 * signs in with `ownerEmail`. `pano` is a reserved address, so nobody can
 * create it through the app first. It only adds what's missing: running it
 * again changes nothing, and it never touches requests.
 */
export async function ensurePanoBoard(
  db: Database,
  input: { ownerEmail: string; ownerName?: string }
): Promise<{ ownerId: string }> {
  // Better Auth stores addresses lowercased; sign-in finds this account.
  const email = input.ownerEmail.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    const ownerId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await tx.insert(users).values({
        id: ownerId,
        email,
        name: cleanDisplayName(input.ownerName ?? ""),
        emailVerified: true,
      });
    }
    await tx
      .insert(organization)
      .values({
        id: PANO_WORKSPACE_ID,
        name: "Pano",
        slug: "pano",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ organizationId: PANO_WORKSPACE_ID, defaultLocale: "en" })
      .onConflictDoNothing();
    await tx
      .insert(member)
      .values({
        id: `mem_pano_${ownerId}`,
        organizationId: PANO_WORKSPACE_ID,
        userId: ownerId,
        role: "owner",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(boards)
      .values(
        PANO_BOARDS.map((board, position) => ({
          organizationId: PANO_WORKSPACE_ID,
          ...board,
          position,
        }))
      )
      .onConflictDoNothing();
    return { ownerId };
  });
}
