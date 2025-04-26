import {NextFunction} from "express";
import crypto from "crypto";
import * as functions from "firebase-functions";

const csrfExemptRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/session-login",
  // "/auth/reset-password",
]

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF protection for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (csrfExemptRoutes.some(route => req.path?.startsWith(route))) {
    return next();
  }

  const csrfCookie = req.cookies?.["CSRF-TOKEN"] as string | undefined;
  const csrfHeader = req.header("x-csrf-token");

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    functions.logger.log("CSRF validation rejected as cookie and header does not match.")
    return res.status(403).json({ status: 403, error: "CSRF token validation failed" });
  }

  return next();
};

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(16).toString("hex");
};