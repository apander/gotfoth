import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "bank_session";
const WEEK = 60 * 60 * 24 * 7;

export async function operator(): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (!value) return false;
  return validSession(value);
}

export async function signIn(passphrase: string) {
  const expected = process.env.BANK_PASSPHRASE ?? "";
  if (expected.length < 12) throw new Error("Set BANK_PASSPHRASE before signing in.");
  const given = createHash("sha256").update(passphrase).digest();
  const actual = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(given, actual)) return false;
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + WEEK * 1000 })).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, sign(body), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK,
  });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function readTokenMatches(header: string | null): boolean {
  const token = process.env.BANK_READ_TOKEN ?? "";
  if (token.length < 32 || !header?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(given, actual);
}

function sign(body: string) {
  const secret = process.env.BANK_SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("Set BANK_SESSION_SECRET to at least 32 characters.");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function validSession(value: string): boolean {
  const split = value.lastIndexOf(".");
  if (split < 0) return false;
  const body = value.slice(0, split);
  const mac = value.slice(split + 1);
  const secret = process.env.BANK_SESSION_SECRET ?? "";
  if (secret.length < 32) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}
