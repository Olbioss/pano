import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";

/**
 * Password hashing that fits the Workers free plan's CPU. Better Auth's
 * default, scrypt, cost about 33 ms a hash on 2026-11-06; PBKDF2 runs in
 * Web Crypto's native code, about 6 ms at 100,000 rounds, which is the most
 * workerd allows.
 *
 * Stored as `pbkdf2-sha256$<rounds>$<salt>$<hash>` (base64url), so a later
 * phase can raise the rounds while old hashes still check.
 */
export const PBKDF2_ROUNDS = 100_000;

const ALGORITHM = "pbkdf2-sha256";
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(password: string, rounds = PBKDF2_ROUNDS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, rounds);
  return [ALGORITHM, rounds, toBase64Url(salt), toBase64Url(hash)].join("$");
}

/** False for a wrong password and for a stored value that doesn't parse. */
export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}) {
  const [algorithm, roundsText, saltText, hashText, ...rest] = hash.split("$");
  if (algorithm !== ALGORITHM || rest.length > 0) return false;
  const rounds = Number(roundsText);
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > PBKDF2_ROUNDS) {
    return false;
  }
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  if (!salt || expected?.length !== HASH_BYTES) return false;
  return sameBytes(await derive(password, salt, rounds), expected);
}

/**
 * Whether Have I Been Pwned lists the password among those leaked in past
 * breaches. Only the first five characters of its SHA-1 hash leave the
 * Worker. When the service fails, the password is accepted: an outage there
 * must not stop anyone signing up.
 */
export async function isBreached(password: string) {
  try {
    return await isPasswordCompromised(password);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[auth] breach check unavailable: ${reason}`);
    return false;
  }
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number
) {
  const key = await crypto.subtle.importKey(
    "raw",
    // The same text can arrive in either Unicode form, depending on the
    // keyboard; NFKC makes them one password, as Better Auth's scrypt does.
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

/** Compares every byte, so the time taken doesn't hint at a near match. */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string | undefined) {
  if (!text || !/^[\w-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
