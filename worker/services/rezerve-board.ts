import { asc, eq } from "drizzle-orm";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import {
  boards,
  member,
  organization,
  posts,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { cleanDisplayName } from "../lib/display-name";
import { createPost } from "./posts";
import { changeStatus } from "./status";

/** Rezerve's feedback board lives at /rezerve. Fixed, so a re-run finds it. */
export const REZERVE_WORKSPACE_ID = "org_rezerve";

/**
 * The workspace's owner on paper. `.invalid` never receives mail, so no
 * sign-in code or reset code for it can reach anyone.
 */
export const REZERVE_OWNER_EMAIL = "owner@rezerve.invalid";
const REZERVE_OWNER_ID = "user_rezerve_owner";

const REZERVE_BOARDS = [
  { slug: "ozellik-istekleri", name: "Özellik istekleri" },
  { slug: "hatalar", name: "Hatalar" },
];

/** What the board opens with, so its first visitor doesn't find it empty. */
const STARTER_REQUESTS: { title: string; body: string; status: PostStatus }[] =
  [
    {
      title: "Randevu öncesi hatırlatma e-postası",
      body: "Müşteriye randevusundan bir gün önce otomatik hatırlatma e-postası gitsin. Gelmeyen müşteri sayısını azaltır.",
      status: "planned",
    },
    {
      title: "Birden fazla personel için ayrı takvim",
      body: "Şu an bir işletme aynı saate tek randevu alabiliyor. Her personelin kendi takvimi olsun, müşteri randevu alırken personel seçebilsin.",
      status: "open",
    },
    {
      title: "Randevuları Excel/CSV olarak indirme",
      body: "Seçtiğim tarih aralığındaki randevuları dosya olarak indirip muhasebeciyle paylaşabileyim.",
      status: "open",
    },
    {
      title: "SMS veya WhatsApp ile hatırlatma",
      body: "Müşterilerimin çoğu e-postasına bakmıyor. Hatırlatma SMS veya WhatsApp mesajı olarak da gidebilsin.",
      status: "open",
    },
  ];

/**
 * Makes sure Rezerve's board exists at /rezerve, in Turkish, with the person
 * who signs in with `adminEmail` on its team as an admin. An account owns
 * one workspace and that person's owns /pano, so this one is owned by a
 * placeholder nobody can sign in as; an admin runs a board all the same.
 * `rezerve` is a reserved address, so nobody can create it through the app
 * first.
 *
 * It only adds what's missing, and it adds the starter requests only while
 * the workspace has no requests at all, so running it again changes nothing
 * and it never touches what people posted.
 */
export async function ensureRezerveBoard(
  db: Database,
  input: { adminEmail: string; adminName?: string }
): Promise<{ adminId: string; requests: number }> {
  // Better Auth stores addresses lowercased; sign-in finds this account.
  const email = input.adminEmail.trim().toLowerCase();
  const adminId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await tx.insert(users).values({
        id,
        email,
        name: cleanDisplayName(input.adminName ?? ""),
        emailVerified: true,
      });
    }
    await tx
      .insert(users)
      .values({
        id: REZERVE_OWNER_ID,
        email: REZERVE_OWNER_EMAIL,
        name: "Rezerve",
        emailVerified: true,
      })
      .onConflictDoNothing();
    await tx
      .insert(organization)
      .values({
        id: REZERVE_WORKSPACE_ID,
        name: "Rezerve",
        slug: "rezerve",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ organizationId: REZERVE_WORKSPACE_ID, defaultLocale: "tr" })
      .onConflictDoNothing();
    await tx
      .insert(member)
      .values([
        {
          id: "mem_rezerve_owner",
          organizationId: REZERVE_WORKSPACE_ID,
          userId: REZERVE_OWNER_ID,
          role: "owner",
          createdAt: new Date(),
        },
        {
          id: `mem_rezerve_${id}`,
          organizationId: REZERVE_WORKSPACE_ID,
          userId: id,
          role: "admin",
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
    await tx
      .insert(boards)
      .values(
        REZERVE_BOARDS.map((board, position) => ({
          organizationId: REZERVE_WORKSPACE_ID,
          ...board,
          position,
        }))
      )
      .onConflictDoNothing();
    return id;
  });
  return { adminId, requests: await addStarterRequests(db, adminId) };
}

/** Posts the starter requests as the admin, unless the board has requests. */
async function addStarterRequests(db: Database, adminId: string) {
  const [any] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.organizationId, REZERVE_WORKSPACE_ID))
    .limit(1);
  if (any) return 0;
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.organizationId, REZERVE_WORKSPACE_ID))
    .orderBy(asc(boards.position))
    .limit(1);
  if (!board) throw new Error("the Rezerve workspace has no board");
  for (const request of STARTER_REQUESTS) {
    const postId = await createPost(db, {
      workspaceId: REZERVE_WORKSPACE_ID,
      locale: "tr",
      boardId: board.id,
      authorId: adminId,
      title: request.title,
      body: request.body,
    });
    if (request.status !== "open") {
      await changeStatus(db, {
        postId,
        userId: adminId,
        status: request.status,
      });
    }
  }
  return STARTER_REQUESTS.length;
}
