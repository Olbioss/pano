import type { DemoRole } from "@/shared/demo";

/**
 * "Try as team" or "Try as member": signs in to a new guest account in the
 * demo workspace. Better Auth answers it (worker/demo/sign-in.ts) and sets
 * the session cookie. Answers the HTTP status when it's refused, or 0 when
 * the server couldn't be reached.
 */
export async function signInDemo(
  as: DemoRole
): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const res = await fetch("/api/auth/demo/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ as }),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
