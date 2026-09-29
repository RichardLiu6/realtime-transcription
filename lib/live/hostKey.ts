import { createHmac, timingSafeEqual } from "crypto";

// Authorizes publishing to one room. An HMAC of the room id, not a JWT: a
// JWT signed with the same secret would also pass as a login token.
export function hostKeyFor(room: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return createHmac("sha256", secret).update(`live-host:${room}`).digest("base64url");
}

export function isHostKey(room: string, key: string | null): boolean {
  if (!key) return false;
  const expected = Buffer.from(hostKeyFor(room));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
