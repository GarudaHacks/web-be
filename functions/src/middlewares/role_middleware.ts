import { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase";
import { RoleType } from "../models/role";

export const restrictToRole = async (
  req: Request,
  res: Response,
  next: NextFunction,
  allowedRoles: string[]
) => {
  try {
    const sessionCookie = req.cookies.__session;

    // Verify session cookie
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);

    // Check if the user's role is in the allowed roles
    const userRole = decodedClaims.role || RoleType.User;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: 403,
        error: "Forbidden: Insufficient permissions",
      });
    }

    req.user = decodedClaims;
    return next();
  } catch (error) {
    console.error("Error verifying session cookie:", error);
    return res.status(401).json({
      status: 401,
      error: "Unauthorized: Invalid or missing session cookie",
    });
  }
};
