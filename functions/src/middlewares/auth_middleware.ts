import * as functions from "firebase-functions";
import { admin, auth } from "../config/firebase";
import { NextFunction, Request, Response } from "express";
import { extractSessionCookieFromCookie } from "../utils/jwt";

// Extend Express Request interface to include the user property.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
    }
  }
}

const authExemptRoutes = [
  "/auth/register",
  "/auth/login",
  "/auth/session-login",
  "/auth/reset-password",
  "/auth/discord/callback",
  "/auth/discord-mobile-process/callback",
  "/auth/discord-mobile/callback"
];
/**
 * Middleware that validates Firebase Session Cookie passed as __session cookie.
 */
export const validateSessionCookie = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Exact match (modulo trailing slashes) so routes nested under an
  // exempt prefix never silently skip auth.
  const normalizedPath = req.path?.replace(/\/+$/, "") ?? "";
  if (authExemptRoutes.includes(normalizedPath)) {
    return next();
  }

  const sessionCookie = extractSessionCookieFromCookie(req);
  // Check for session cookie
  if (!sessionCookie) {
    functions.logger.error("No session cookie found:", req)
    res.status(401).json({
      status: 401,
      error: "Unauthorized",
    });
    return;
  }
  try {
    const decodedSessionCookie = await auth.verifySessionCookie(
      sessionCookie,
      true
    );
    req.user = decodedSessionCookie;
    return next();
  } catch (error) {
    // Invalid, expired, or revoked session cookie: an auth failure, not a
    // server error, so the client knows to re-authenticate.
    functions.logger.error("Error while verifying session cookie:", error);
    res.status(401).json({
      status: 401,
      error: "Unauthorized",
    });
  }
};
