import {Request, Response} from "express";
import {db, auth} from "../config/firebase";
import axios from "axios";
import validator from "validator";
import { User, formatUser } from "../models/user";
import {FieldValue} from "firebase-admin/firestore";
import {convertResponseToSnakeCase} from "../utils/camel_case";
import * as functions from "firebase-functions";
import {FirebaseError} from "firebase-admin";
import {TypedRequestBody} from "../types/express";

const validateEmailAndPassword = (
  email: string,
  password: string,
  res: Response
): boolean => {
  if (!validator.isEmail(email)) {
    res.status(400).json({error: "Invalid email"});
    return false;
  }

  if (!validator.isLength(password, {min: 6})) {
    res
      .status(400)
      .json({error: "Password must be at least 6 characters long"});
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

    // set cookies
    res.cookie("__session", token.idToken, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    res.cookie("refresh_token", token.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(200).json(
      convertResponseToSnakeCase({
        message: "Login successful",
        user: {
          email: user.email,
          displayName: user.displayName,
        },
        idToken: token.idToken,
        refreshToken: token.refreshToken,
        expiresIn: token.expiresIn,
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({error: "Invalid email or password"});
  }
};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const {name, email, password} = req.body;

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
      await axios.post(url, {token: customToken, returnSecureToken: true})
    ).data;

    const userData: User = formatUser({
      email: user.email ?? "",
      firstName: user.displayName ?? "",
      status: "not applicable",
    });

    await db
      .collection("users")
      .doc(user.uid)
      .set({
        ...userData,
        createdAt: FieldValue.serverTimestamp(),
      });

    // set cookies
    res.cookie("__session", token.idToken, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    res.cookie("refresh_token", token.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(201).json(
      convertResponseToSnakeCase({
        message: "Registration successful",
        user: {
          email: user.email,
          displayName: user.displayName,
        },
        idToken: token.idToken,
        refreshToken: token.refreshToken,
        expiresIn: token.expiresIn,
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({error: err.message});
  }
};

export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {refreshToken} = req.body;

  if (!refreshToken) {
    res.status(400).json({error: "Refresh token is required"});
    return;
  }

  try {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    const url = isEmulator
      ? "http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=dummy-key"
      : `https://securetoken.googleapis.com/v1/token?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    ).data;

    // set cookies
    res.cookie("__session", token.id_token, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(200).json(
      convertResponseToSnakeCase({
        accessToken: token.id_token,
        expiresIn: token.expires_in,
        refreshToken: token.refresh_token,
        idToken: token.id_token,
        userId: token.user_id,
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({error: "Refresh token is invalid"});
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(400).json({error: "User not authenticated"});
    return;
  }

  try {
    await auth.revokeRefreshTokens(req.user.uid);

    // remove cookies
    res.clearCookie("__session", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });

    res.status(200).json({
      message: "Logout successful",
    });
  } catch (error) {
    const err = error as Error;
    functions.logger.error("Error when trying to logout", err.message);
    res.status(500).json({error: "Logout failed"});
  }
};

/**
 * Returns __session and refresh_token cookie. Intended to be used for login using firebase sdk.
 */
export const sessionLogin = async (req: TypedRequestBody<{
  idToken: string;
  refreshToken: string;
  exp: number;
  csrfToken?: string;
}>, res: Response): Promise<void> => {
  // const csrfToken = req.body.csrfToken || req.headers["csrf-token"];

  const idToken = req.body.idToken;
  if (!idToken) {
    functions.logger.error("idToken is not present in the body.")
    res.status(400).json({
      status_code: 400,
      data: "Bad request"
    });
    return;
  }

  try {
    const cookies = await auth.createSessionCookie(idToken, { expiresIn: 60 * 5 * 1000 }); // expires in 5 mins

    res.status(200).json({
      cookies: cookies
    })
  } catch(e) {
    functions.logger.error("Error when trying to createSessionCookie", e);
    res.status(500).json({error: e});
  }




  // let isValidToken = false;
  // const idToken = req.body.idToken;
  //
  // let isValidRefreshToken = false;
  // const refreshToken = req.body.refreshToken;
  //
  // const exp = req.body.exp;
  //
  // try {

  //
  //   const idToken = await auth.verifyIdToken(idToken)
  //   const epochNow = new Date().getTime() / 1000;
  //   isValidToken = true;
  //
  //
  // } catch (e) {
  //   functions.logger.error("Error while verifying Firebase ID token:", e);
  //   res.status(403).json({error: "Unauthorized"});
  // }
  //
  // try {
  //   if (!refreshToken) {
  //     functions.logger.error("refreshToken is not present in the body.")
  //     res.status(400).json({
  //       status_code: 400,
  //     })
  //   }
  //
  //   const decodedToken = await auth.verifyIdToken(idToken)
  //   const expiresIn = decodedToken.exp;
  //   const epochNow = new Date().getTime() / 1000;
  //   isValidToken = true;
  // } catch (e) {
  //   functions.logger.error("Error while verifying Refresh Token:", e);
  //   res.status(403).json({error: "Unauthorized"});
  // }
  //
  // // set success cookies
  // res.cookie("__session", decodedToken, {
  //   httpOnly: true,
  //   maxAge: expiresIn - epochNow,
  //   sameSite: "strict",
  //   secure: process.env.NODE_ENV === "production"
  // });
  // res.status(200).json({
  //   status_code: 200,
  //   data: true
  // })



}

/**
 * Used to invalidate user's token everywhere.
 * @param req
 * @param res
 */
export const invalidateToken = async (req: Request, res: Response): Promise<void> => {
  try {

    if (!req.body.uid) {
      res.status(400).json({error: "Refresh token is required"});
      return;
    }

    await auth.revokeRefreshTokens(req.body.uid);
    res.status(200).json({
      status_code: 200,
      data: true
    })
  } catch (error) {
    const err = error as FirebaseError;

    if (err.code === "auth/user-not-found") {
      res.status(400).json({
        status_code: 400,
        error: "No such user"
      });
      return;
    }

    functions.logger.error("Error when revoking user token:", err.message);
    res.status(500).json({error: "Internal server error"});
  }
}

export const tokenSandbox = async (req: Request, res: Response): Promise<void> => {
  try {
    // let idToken = req.body.idToken;
    // idToken = await auth.verifyIdToken(idToken)
    // res.status(200).json({
    //   decoded: idToken,
    // })
    let refreshToken = req.body.refreshToken;
    refreshToken = await auth.verifySessionCookie(refreshToken, true);
    res.status(200).json({
      decoded: refreshToken,
    })
    return
  } catch (error) {
    res.status(500).json({error: error});
    return
  }
}