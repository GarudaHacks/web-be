import { NextFunction, Request, Response, RequestHandler } from "express";
import crypto from "crypto";
import * as functions from "firebase-functions";

const csrfExemptRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/session-login",
  "/auth/logout",
  // "/auth/reset-password",
];

export const csrfProtection: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip CSRF protection for GET, HEAD, OPTIONS
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  if (csrfExemptRoutes.some((route) => req.path?.startsWith(route))) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.["CSRF-TOKEN"] as string | undefined;
  const csrfHeader = req.header("x-csrf-token");

  functions.logger.log("CSRF Cookie:", csrfCookie);
  functions.logger.log("CSRF Header:", csrfHeader);

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    functions.logger.log(
      "CSRF validation rejected as cookie and header does not match."
    );
    res
      .status(403)
      .json({ status: 403, error: "CSRF token validation failed" });
    return;
  }

  next();
};

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(16).toString("hex");
};
