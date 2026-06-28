import crypto from "crypto";

/**
 * Signs check-in QR codes for boarding passes.
 *
 *   message = `${userId}/${firstName}/${lastName}/${confirmedRsvpAt}`
 *   sig     = base64url(HMAC_SHA256(SECRET, message)).slice(0, SIG_LEN)
 *   QR      = `${message}/${sig}`
 *
 * This MUST stay byte-for-byte identical to the verifier in
 * gh-admin/lib/hmac.ts — same secret, same algorithm, same SIG_LEN, and the
 * message must use the exact same field values that are returned to the portal.
 *
 * CHECKIN_HMAC_SECRET must never be exposed to a browser.
 */

const SECRET = process.env.CHECKIN_HMAC_SECRET;
const SIG_LEN = 22;

/**
 * Sign a checkIn qr string using hmac with the a signing secret.
 */
export function signCheckIn(
  userId: string,
  firstName: string,
  lastName: string,
  confirmedRsvpAt: string
): string {
  if (!SECRET) throw new Error("CHECKIN_HMAC_SECRET is not set");
  const message = `${userId}/${firstName}/${lastName}/${confirmedRsvpAt}`;
  return crypto
    .createHmac("sha256", SECRET)
    .update(message)
    .digest("base64url")
    .slice(0, SIG_LEN);
}
