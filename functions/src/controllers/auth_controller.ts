import { Request, Response } from "express";
import { admin, db, auth } from "../config/firebase";
import axios from "axios";

/**
 * Logs in user
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const login = async (req: Request, res: Response): Promise<void> => {};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  try {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

    const user = await auth.createUser({
      displayName: name,
      email,
      password,
    });

    console.log(`WEB_API_KEY=${process.env.WEB_API_KEY}`);

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
      message: "User created successfully",
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
