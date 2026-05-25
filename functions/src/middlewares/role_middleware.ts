import { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase";
import * as functions from "firebase-functions";

export const isMentor = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const sessionCookie = req.cookies.__session;
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
    const userIsMentor = decodedClaims.mentor === true;
    if (!userIsMentor) {
      res.status(403).json({
        status: 403,
        error: "Forbidden: Insufficient permissions",
      });
      return;
    }
    req.user = decodedClaims;
    next();
  } catch (error) {
    functions.logger.error("Error while verifying user:", error);
    res.status(500).json({
      status: 500,
      error: "Something went wrong",
    });
  }
}