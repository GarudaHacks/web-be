import { NextFunction, Request, Response } from "express";
import { auth, db } from "../config/firebase";
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

export const isConfirmedRSVP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const uid = req.user?.uid
    if (!uid) {
      res.status(403).json({status: 403, error: "Insufficient permission"})
      return
    }
    const userRef = db.collection("users").doc(uid)
    const snap = await userRef.get()
    if (!snap.exists) {
      res.status(404).json({status: 404, error: "Data not found"})
      return
    }
    const data = snap.data()
    if (!data || data.status !== "confirmed rsvp") {
      res.status(403).json({status: 403, error: "RSVP not confirmed"})
      return
    }
    next()
  } catch (error) {
    functions.logger.error(`Error isConfirmedRSVP: ${error}`)
    res.status(500).json({status: 500, error: "Something went wrong"})
    return
  }
}