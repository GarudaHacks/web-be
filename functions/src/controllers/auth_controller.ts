import {Request, Response} from "express";
import {auth, db} from "../config/firebase";
import axios from "axios";
import validator from "validator";
import {formatUser, User} from "../models/user";
import {FieldValue} from "firebase-admin/firestore";
import {convertResponseToSnakeCase} from "../utils/camel_case";
import * as functions from "firebase-functions";
import {FirebaseError} from "firebase-admin";
import {generateCsrfToken} from "../middlewares/csrf_middleware";
import {APPLICATION_STATUS} from "../types/application_types";

const SESSION_EXPIRY_SECONDS = 14 * 24 * 60 * 60 * 1000; // lasts 2 weeks

const validateEmailAndPassword = (
  email: string,
  password: string,
  res: Response
): boolean => {
  if (!validator.isEmail(email)) {
    res.status(400).json({
      status: 400,
      error: "Invalid email"
    });
    return false;
  }

  if (!validator.isLength(password, {min: 6})) {
    res
      .status(400)
      .json({
        status: 400,
        error: "Password must be at least 6 characters long"});
    return false;
  }

  return true;
};

/**
 * Logs in user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  const {email, password} = req.body;

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

    try {
      const cookies = await auth.createSessionCookie(token.idToken, {expiresIn: SESSION_EXPIRY_SECONDS});

      // set session cookies
      res.cookie("__session", cookies, {
        httpOnly: true,
        maxAge: SESSION_EXPIRY_SECONDS,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production"
      });

      // revoke refresh token
      await auth.revokeRefreshTokens(user.uid)

      const csrfToken = generateCsrfToken();
      // http only cookie
      res.cookie("CSRF-TOKEN", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      });
      // non http only cookie
      res.cookie("XSRF-TOKEN", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      })
    } catch (e) {
      functions.logger.error("Error when returning session for login", e);
      res.status(500).json({error: "Something went wrong."});
      return
    }

    res.status(200).json(
      convertResponseToSnakeCase({
        message: "Login successful",
        user: {
          email: user.email,
          displayName: user.displayName,
        },
      })
    );
  } catch (error) {
    const err = error as Error;
    functions.logger.error("Error when trying to log in:", err.message);
    res.status(400).json({status: 400, error: "Invalid email or password"});
  }
};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const {name, email, password} = req.body;

  if (!validateEmailAndPassword(email, password, res)) return;

  try {

    if (!name) {
      res.status(400).json({
        status: 400,
        error: "Name is required"
      })
      return
    }

    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    const user = await auth.createUser({
      displayName: name,
      email,
      password,
    });

    // set custom claims to user
    await auth.setCustomUserClaims(user.uid, {
      role: "User"
    })

    const customToken = await auth.createCustomToken(user.uid);

    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, {token: customToken, returnSecureToken: true})
    ).data;

    const userData: User = formatUser({
      email: user.email ?? "",
      firstName: user.displayName ?? "",
      status: APPLICATION_STATUS.NOT_APPLICABLE,
    });

    await db
      .collection("users")
      .doc(user.uid)
      .set({
        ...userData,
        createdAt: FieldValue.serverTimestamp(),
      });

    try {
      const cookies = await auth.createSessionCookie(token.idToken, {expiresIn: SESSION_EXPIRY_SECONDS});
      // set cookies
      res.cookie("__session", cookies, {
        httpOnly: true,
        maxAge: SESSION_EXPIRY_SECONDS,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production"
      });

      const csrfToken = generateCsrfToken();
      // http only cookie
      res.cookie("CSRF-TOKEN", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      });
      // non http only cookie
      res.cookie("XSRF-TOKEN", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      })
    } catch (e) {
      functions.logger.error("Error when returning session for register", e);
      res.status(500).json({
        status: 500,
        error: "Something went wrong"});
      return
    }

    res.status(201).json(
      convertResponseToSnakeCase({
        status: 201,
        message: "Registration successful",
        user: {
          email: user.email,
          displayName: user.displayName,
        },
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({status: 400, error: err.message});
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const user = req.user!; // from auth middleware
  try {
    await auth.revokeRefreshTokens(user.uid);

    // remove cookies
    res.clearCookie("__session", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(200).json({
      status: 200,
      message: "Logout successful",
    });
  } catch (error) {
    const err = error as Error;
    functions.logger.error("Error when trying to logout", err.message);

    // force remove cookies
    res.clearCookie("__session", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(500).json({status, error: "Something went wrong."});
  }
};

/**
 * Session login. Required for native Google Sign In Button.
 */
export const sessionLogin = async (req: Request, res: Response): Promise<void> => {
  const idToken = req.body.id_token;
  if (!idToken) {
    functions.logger.warn("Required id_token in the body")
    res.status(400).json({
      status: 400,
      error: "Required id_token in the body"
    });
    return;
  }

  try {
    const cookies = await auth.createSessionCookie(idToken, {expiresIn: SESSION_EXPIRY_SECONDS}); // lasts a week

    const decodedIdToken = await auth.verifyIdToken(idToken);

    let user;
    if (decodedIdToken.email != null) {
      user = await auth.getUserByEmail(decodedIdToken.email);

      // update user record for first time
      const docRef = await db.collection("questions").doc(user.uid).get();
      if (!docRef.exists) {
        const userData: User = formatUser({
          email: user.email ?? "",
          firstName: user.displayName ?? "",
          status: APPLICATION_STATUS.NOT_APPLICABLE,
        });
        await db
          .collection("users")
          .doc(user.uid)
          .set({
            ...userData,
            createdAt: FieldValue.serverTimestamp(),
          });
      }
    } else {
      functions.logger.error("Could not find existing user with email", decodedIdToken.email);
      res.status(400).json({status: 400, error: "Invalid credentials"});
      return;
    }

    res.cookie("__session", cookies, {
      httpOnly: true,
      maxAge: SESSION_EXPIRY_SECONDS,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    const csrfToken = generateCsrfToken();
    // http only cookie
    res.cookie("CSRF-TOKEN", csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });
    // non http only cookie
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    })

    res.status(200).json({
      status: 200,
      "message": "Login successful",
      "user": {
        email: user.email,
        displayName: user.displayName,
      }
    })
  } catch (e) {
    const err = e as FirebaseError;
    if (err.code === "auth/user-not-found") {
      functions.logger.error("User not found", e);
      res.status(404).json({status: 404, error: "User not found"});
      return;
    } else if (err.code === "auth/invalid-id-token") {
      functions.logger.error("Invalid credentials");
      res.status(401).json({status: 401, error: "ID token is invalid"});
      return;
    } else if (err.code === "auth/id-token-expired") {
      functions.logger.error("The provided Firebase ID token is expired");
      res.status(401).json({status: 401, error: "The provided Firebase ID token is expired"});
      return;
    }
    functions.logger.error("Error when trying to session login", e);
    res.status(500).json({status: 500, error: e});
  }
}

/**
 * Verify cookie session. To be fetched by auth state manager.
 * @param req
 * @param res
 */
export const sessionCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const decodedSessionCookie = await auth.verifySessionCookie(req.cookies.__session);

    if (!decodedSessionCookie) {
      functions.logger.error("Could not find session cookie")
      res.status(400).json({status: 400, error: "Could not find session cookie"});
    }

    res.status(200).json({
      status: 200,
      message: "Session is valid",
      data: {
        user: {
          email: decodedSessionCookie.email,
          displayName: decodedSessionCookie.name
        }
      }
    })
    return
  } catch (e) {
    functions.logger.error("Error when trying to check session", e);
    res.status(400).json({status: 400, error: e});
  }
}