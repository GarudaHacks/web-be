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
];

/**
 * Middleware that validates Firebase Session Cookie passed as __session cookie.
 */
export const validateSessionCookie = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (authExemptRoutes.some((route) => req.path?.startsWith(route))) {
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
    functions.logger.error("Error while verifying session cookie:", error);
    res.status(500).json({
      status: 500,
      error: "Error while verifying session cookie",
    });
  }
};
