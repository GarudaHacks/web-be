import {Request} from "express";
import {admin} from "../config/firebase";
import * as functions from "firebase-functions";

/**
 * Extract __session from Header or Cookies. Otherwise, return none.
 * @param req
 */
export function extractSessionFromHeaderOrCookies(req: Request) {
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    functions.logger.log("Found \"Authorization\" header");
    // Extract the token from the header.
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else if (req.cookies) {
    functions.logger.log("Found \"__session\" cookie");
    idToken = req.cookies.__session;
  }

  if (idToken) {
    return idToken;
  }
  return;
}

// eslint-disable-next-line require-jsdoc
export async function getUidFromToken(req: Request): Promise<string | null> {
  const idToken = extractSessionFromHeaderOrCookies(req)

  if (!idToken) return null;

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid; // this is the Firebase user's UID
  } catch (err) {
    console.error("Token verification failed", err);
    return null;
  }
}
