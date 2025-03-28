import { Request, Response } from "express";
import { admin, db, auth } from "../config/firebase";
import axios from "axios";
import validator from "validator";

/**
 * Logs in user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!validator.isEmail(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (!validator.isLength(password, { min: 6 })) {
    res
      .status(400)
      .json({ error: "Password must be at least 6 characters long" });
    return;
  }

  try {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

    const user = await db.collection("users").where("email", "==", email).get();
    if (user.empty) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userDoc = user.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();

    let token;
    if (isEmulator) {
      const customToken = await auth.createCustomToken(userId);
      token = {
        idToken: customToken,
        refreshToken: null,
        expiresIn: 3600,
      };
    } else {
      token = (
        await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.WEB_API_KEY}`,
          { email, password, returnSecureToken: true }
        )
      ).data;
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        email: userData.email,
        displayName: userData.name,
      },
      idToken: token.idToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
    });
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  if (!validator.isEmail(email)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }

  if (!validator.isLength(password, { min: 6 })) {
    res
      .status(400)
      .json({ error: "Password must be at least 6 characters long" });
    return;
  }

  try {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

    const user = await auth.createUser({
      displayName: name,
      email,
      password,
    });

    let token;
    if (isEmulator) {
      const customToken = await auth.createCustomToken(user.uid);
      token = {
        idToken: customToken,
        refreshToken: null,
        expiresIn: 3600,
      };
    } else {
      token = (
        await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.WEB_API_KEY}`,
          { email, password, returnSecureToken: true }
        )
      ).data;
    }

    await db.collection("users").doc(user.uid).set({
      email,
      name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      message: "Registration successful",
      user: {
        email: user.email,
        displayName: user.displayName,
      },
      idToken: token.idToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
    });
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({ error: err.message });
  }
};
