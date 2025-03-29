import { Request, Response } from "express";
import { db, auth } from "../config/firebase";
import axios from "axios";
import validator from "validator";
import { FieldValue } from "firebase-admin/firestore";

const validateEmailAndPassword = (
  email: string,
  password: string,
  res: Response
): boolean => {
  if (!validator.isEmail(email)) {
    res.status(400).json({ error: "Invalid email" });
    return false;
  }

  if (!validator.isLength(password, { min: 6 })) {
    res
      .status(400)
      .json({ error: "Password must be at least 6 characters long" });
    return false;
  }

  return true;
};

/**
 * Logs in user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!validateEmailAndPassword(email, password, res)) return;

  try {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, {
        email,
        password,
        returnSecureToken: true,
      })
    ).data;

    const user = await auth.getUserByEmail(email);

    res.status(200).json({
      message: "Login successful",
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

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  if (!validateEmailAndPassword(email, password, res)) return;

  try {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    const user = await auth.createUser({
      displayName: name,
      email,
      password,
    });

    const customToken = await auth.createCustomToken(user.uid);

    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, { token: customToken, returnSecureToken: true })
    ).data;

    await db.collection("users").doc(user.uid).set({
      email: user.email,
      first_name: user.displayName,
      last_name: null,
      date_of_birth: null,
      education: null,
      school: null,
      grade: null,
      year: null,
      gender_identity: null,
      status: "not applicable",
      portfolio: null,
      github: null,
      linkedin: null,
      admin: false,
      created_at: FieldValue.serverTimestamp(),
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
