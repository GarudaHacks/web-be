import { Request } from "express";
import {admin} from "../config/firebase";

// eslint-disable-next-line require-jsdoc
export async function getUidFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) return null;

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid; // this is the Firebase user's UID
  } catch (err) {
    console.error("Token verification failed", err);
    return null;
  }
}
