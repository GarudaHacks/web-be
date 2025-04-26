import {Request} from "express";
import {admin} from "../config/firebase";
import * as functions from "firebase-functions";

/**
 * Extract __session from Header or Cookies. Otherwise, return none.
 * @param req
 */
export function extractSessionFromHeaderOrCookies(req: Request) {
  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    functions.logger.log("Found \"Authorization\" header");
    // Extract the token from the header.
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else if (req.cookies.__session) {
    functions.logger.log("Found \"__session\" cookie");
    idToken = req.cookies.__session;
  }

  if (idToken) {
    functions.logger.warn("Authorization token cannot be found in header or __session cookie.")
    return idToken;
  }
  return;
}

/**
 * Get refresh token from cookie. Return none otherwise.
 * @param req
 */
export function extractSessionCookieFromCookie(req: Request) {
  let sessionCookie;
  if (req.cookies.__session) {
    functions.logger.log("Found __session cookie");
    sessionCookie = req.cookies.__session;
    return sessionCookie;
  }
  functions.logger.warn("Cannot find __session cookie");
  return;
}

/**
 * Get UID from token using Firebase method `verifyIdToken`.
 * @param req
 */
export async function getUidFromSessionCookie(req: Request): Promise<string | null> {
  const sessionCookie = extractSessionCookieFromCookie(req)

  if (!sessionCookie) return null;

  try {
    const decodedToken = await admin.auth().verifySessionCookie(sessionCookie);
    functions.logger.log("Decoded session cookie", decodedToken);
    return decodedToken.user_id; // this is the Firebase user's UID
  } catch (err) {
    functions.logger.error("Session token verification failed", err);
    return null;
  }
}
