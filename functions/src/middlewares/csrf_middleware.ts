import { NextFunction, Request, Response, RequestHandler } from "express";
import crypto from "crypto";
import * as functions from "firebase-functions";

const csrfExemptRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/session-login",
  "/auth/reset-password",
  "/auth/logout",
  "/auth/verify-account",
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
  const csrfHeader = req.header("x-xsrf-token");

  if (!csrfCookie || !csrfHeader) {
    functions.logger.log(
      "CSRF validation rejected: Missing token in cookie or header"
    );
    res
      .status(403)
      .json({ status: 403, error: "CSRF token validation failed" });
    return;
  }

  if (
    !crypto.timingSafeEqual(Buffer.from(csrfCookie), Buffer.from(csrfHeader))
  ) {
    functions.logger.log("CSRF validation rejected: Token mismatch");
    res
      .status(403)
      .json({ status: 403, error: "CSRF token validation failed" });
    return;
  }

  next();
};

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

export const setCsrfCookie = (res: Response, token: string): void => {
  res.cookie("CSRF-TOKEN", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
};
