import { Request, Response } from "express";
import { db } from "../config/firebase";

interface User {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: string;
  school?: string;
  grade?: number | null;
  year?: number | null;
  genderIdentity?: string;
  status?: string;
  portfolio?: string;
  github?: string;
  linkedin?: string;
  admin?: boolean;
}

/**
 * Helper for standardizing user data
 */
const formatUser = (data: Partial<User>): User => ({
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  email: data.email || "",
  dateOfBirth: data.dateOfBirth || "",
  school: data.school || "",
  grade: data.grade || null,
  year: data.year || null,
  genderIdentity: data.genderIdentity || "",
  status: data.status || "",
  portfolio: data.portfolio || "",
  github: data.github || "",
  linkedin: data.linkedin || "",
  admin: data.admin || false,
});

/**
 * Creates new user
 */
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requiredFields: (keyof User)[] = ["email", "firstName", "lastName"];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    const userData: User = formatUser(req.body);
    const userRef = await db.collection("users").add({ ...userData });
    res.json({ success: true, userId: userRef.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Fetch all users
 */
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
