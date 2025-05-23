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

  functions.logger.log(
    "Checking if request is authorized with session cookies"
  );

  const sessionCookie = extractSessionCookieFromCookie(req);
  // Check for session cookie
  if (!sessionCookie) {
    functions.logger.error(
      "No session cookie found. Login for session cookies."
    );
    res.status(401).json({
      status: 401,
      error: "No session cookie found",
    });
    return;
  }
  try {
    const decodedSessionCookie = await auth.verifySessionCookie(
      sessionCookie,
      true
    );
    functions.logger.log(
      "Session cookie correctly decoded",
      decodedSessionCookie
    );
    req.user = decodedSessionCookie;
    return next();
  } catch (error) {
    functions.logger.error("Error while verifying session cookie:", error);
    res.status(401).json({
      status: 401,
      error: "Error while verifying session cookie",
    });
  }
};
