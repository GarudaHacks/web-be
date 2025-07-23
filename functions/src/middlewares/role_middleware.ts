import { NextFunction, Response } from "express";
import { auth } from "../config/firebase";
import * as functions from "firebase-functions";

export const isMentor = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const sessionCookie = req.cookies.__session;
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    const userIsMentor = decodedClaims.mentor === true;
    if (!userIsMentor) {
      return res.status(403).json({
        status: 403,
        error: "Forbidden: Insufficient permissions",
      });
    }
    req.user = decodedClaims;
    return next();
  } catch (error) {
    functions.logger.error("Error while verifying user:", error);
    return res.status(500).json({
      status: 500,
      error: "Something went wrong",
    });
  }
}