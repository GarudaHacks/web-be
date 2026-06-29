import { Request, Response } from "express";
import { auth, db } from "../config/firebase";
import axios from "axios";
import validator from "validator";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { FirebaseError } from "firebase-admin";
import { generateCsrfToken } from "../middlewares/csrf_middleware";
import { APPLICATION_STATUS } from "../types/application_types";
import { User, AuthResponse } from "../models/user";
import { sendEmailVerificationEmail, sendResetPasswordEmail } from "../utils/email_sender";

const SESSION_EXPIRY_SECONDS = 14 * 24 * 60 * 60 * 1000; // lasts 2 weeks

const deriveRole = (claims?: Record<string, unknown>): string => {
  if (claims?.admin === true) return "admin";
  if (claims?.mentor === true) return "mentor";
  return "hacker";
};

const validateEmailAndPassword = (
  email: string,
  password: string,
  res: Response
): boolean => {
  if (!validator.isEmail(email)) {
    res.status(400).json({
      status: 400,
      error: "Invalid email",
    });
    return false;
  }

  if (!validator.isLength(password, { min: 6 })) {
    res.status(400).json({
      status: 400,
      error: "Password must be at least 6 characters long",
    });
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

    // Get user detail
    const user = await auth.getUserByEmail(email);

    const userDoc = await db.collection("users").doc(user.uid).get()

    try {
      const cookies = await auth.createSessionCookie(token.idToken, {
        expiresIn: SESSION_EXPIRY_SECONDS,
      });

      // set session cookies
      res.cookie("__session", cookies, {
        httpOnly: true,
        maxAge: SESSION_EXPIRY_SECONDS,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });

      // revoke refresh token
      await auth.revokeRefreshTokens(user.uid);

      const csrfToken = generateCsrfToken();
      // http only cookie
      res.cookie("CSRF-TOKEN", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      // non http only cookie
      res.cookie("XSRF-TOKEN", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    } catch (e) {
      functions.logger.error("Error when returning session for login", e);
      res.status(500).json({ error: "Something went wrong." });
      return;
    }

    const authResponse: AuthResponse = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      emailVerified: user.emailVerified,
      status: userDoc.data()?.status ?? APPLICATION_STATUS.NOT_APPLICABLE,
      role: deriveRole(user.customClaims),
      discord_uid: userDoc.data()?.discord_uid,
    };
    res.status(200).json({
      message: "Login successful",
      user: authResponse,
    }
    );
  } catch (error) {
    const err = error as Error;
    functions.logger.error("Error when trying to log in:", err.message);
    res.status(400).json({ status: 400, error: "Invalid email or password" });
  }
};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  if (!validateEmailAndPassword(email, password, res)) return;
  if (!name) {
    res.status(400).json({
      status: 400,
      error: "Name is required",
    });
    return;
  }

  let user;
  try {
    let verified = false
    if (process.env.NODE_ENV === "development") {
      verified = true
    }
    user = await auth.createUser({
      displayName: name,
      email,
      password,
      "emailVerified": verified
    });
    // set custom claims to user
    await auth.setCustomUserClaims(user.uid, {
      role: "User",
    });
  } catch (error) {
    const err = error as FirebaseError;
    if (err.code?.match("auth/email-already-exists")) {
      res.status(409).json({
        status: 409,
        error: "Email already exists",
      });
      return;
    } else {
      functions.logger.error("Error when trying to register an user:", err);
      res.status(500).json({
        status: 500,
        error: "Something went wrong",
      });
      return;
    }
  }

  // if user already in db (e.g. signed up using google previously) then we would not want to create a new document
  try {
    const existingUserRef = await db.collection("users").doc(user.uid).get();
    if (!existingUserRef.exists) {
      const userData: User = {
        userId: user.uid,
        email: email ?? "",
        displayName: name ?? "",
        status: APPLICATION_STATUS.NOT_APPLICABLE,
      };
      await db
        .collection("users")
        .doc(user.uid)
        .set({
          ...userData,
          createdAt: FieldValue.serverTimestamp(),
        });
    }
  } catch (error) {
    functions.logger.error(
      "Error when checking existing user for registration:",
      error
    );
    res.status(500).json({
      status: 500,
      error: "Something went wrong",
    });
    return;
  }

  try {
    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    if (process.env.NODE_ENV !== "development") {
      const verificationLink = await auth.generateEmailVerificationLink(email);
      await sendEmailVerificationEmail(email, verificationLink);
    }

    const customToken = await auth.createCustomToken(user.uid);

    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, { token: customToken, returnSecureToken: true })
    ).data;

    try {
      const cookies = await auth.createSessionCookie(token.idToken, {
        expiresIn: SESSION_EXPIRY_SECONDS,
      });
      // set cookies
      res.cookie("__session", cookies, {
        httpOnly: true,
        maxAge: SESSION_EXPIRY_SECONDS,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });

      const csrfToken = generateCsrfToken();
      // http only cookie
      res.cookie("CSRF-TOKEN", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      // non http only cookie
      res.cookie("XSRF-TOKEN", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    } catch (e) {
      functions.logger.error("Error when returning session for register", e);
      res.status(500).json({
        status: 500,
        error: "Something went wrong",
      });
      return;
    }

    const authResponse: AuthResponse = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      emailVerified: user.emailVerified,
      status: APPLICATION_STATUS.NOT_APPLICABLE,
      role: deriveRole(user.customClaims),
    };
    res.status(201).json({
      status: 201,
      message:
        "Registration successful. Please check your email for verification link.",
      user: authResponse,
    }
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(500).json({ status: 500, error: err.message });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const user = req.user; // from auth middleware
  if (!user) {
    res.status(401).json({ status: 401, error: "Unauthorized" });
    return;
  }
  try {
    await auth.revokeRefreshTokens(user.uid);

    // remove cookies
    res.clearCookie("__session", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
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
      secure: process.env.NODE_ENV === "production",
    });

    res.status(500).json({ status, error: "Something went wrong." });
  }
};

/**
 * Session login. Required for native Google Sign In Button.
 */
export const sessionLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  const idToken = req.body.id_token;



  if (!idToken) {
    functions.logger.warn("Required id_token in the body");
    res.status(400).json({
      status: 400,
      error: "Required id_token in the body",
    });
    return;
  }

  let user;
  let decodedIdToken;

  // validate user through token
  try {
    decodedIdToken = await auth.verifyIdToken(idToken);
  } catch (error) {
    const err = error as FirebaseError;
    if (err.code === "auth/user-not-found") {
      functions.logger.error("User not found", error);
      res.status(404).json({ status: 404, error: "User not found" });
      return;
    } else if (err.code === "auth/invalid-id-token") {
      functions.logger.error("Invalid credentials");
      res.status(401).json({ status: 401, error: "ID token is invalid" });
      return;
    } else if (err.code === "auth/id-token-expired") {
      functions.logger.error("The provided Firebase ID token is expired");
      res.status(401).json({
        status: 401,
        error: "The provided Firebase ID token is expired",
      });
      return;
    }
    functions.logger.error("Error when trying to session login user:", error);
    res.status(500).json({ status: 500, error: "Something went wrong" });
    return;
  }

  if (decodedIdToken.email === undefined) {
    functions.logger.error("Email cannot be found in id token.");
    res.status(400).json({ status: 400, error: "Invalid credentials" });
    return;
  }

  // handle when user does not exist
  try {
    user = await auth.getUserByEmail(decodedIdToken.email);
  } catch (error) {
    const err = error as FirebaseError;
    if (err.code === "auth/user-not-found") {
      functions.logger.error("User not found", error);
      res.status(404).json({ status: 404, error: "User not found" });
      return;
    }
    functions.logger.error("Error when checking if user exists:", error);
    res.status(500).json({ status: 500, error: "Something went wrong" });
    return;
  }

  // handle when user is new or existing
  let userStatus: string = APPLICATION_STATUS.NOT_APPLICABLE;
  let userDiscordUid: string | undefined = undefined;
  try {
    const userDocumentRef = await db.collection("users").doc(user.uid).get();
    if (!userDocumentRef.exists) { // when user is a new user, then populate db
      const userData: User = {
        userId: user.uid,
        email: user.email ?? "",
        displayName: user.displayName ?? "",
        status: APPLICATION_STATUS.NOT_APPLICABLE,
      };
      await db
        .collection("users")
        .doc(user.uid)
        .set({
          ...userData,
          createdAt: FieldValue.serverTimestamp(),
        });
    } else {
      userStatus = userDocumentRef.data()?.status ?? APPLICATION_STATUS.NOT_APPLICABLE;
      userDiscordUid = userDocumentRef.data()?.discord_uid;
      user = await auth.getUserByEmail(decodedIdToken.email);
    }
  } catch (error) {
    functions.logger.error(
      "Error when trying to check if user existed for session login",
      error
    );
    return;
  }

  // finally, set cookie
  try {
    const cookies = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_SECONDS,
    }); // lasts a week

    res.cookie("__session", cookies, {
      httpOnly: true,
      maxAge: SESSION_EXPIRY_SECONDS,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    const csrfToken = generateCsrfToken();
    // http only cookie
    res.cookie("CSRF-TOKEN", csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    // non http only cookie
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    const authResponse: AuthResponse = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      emailVerified: user.emailVerified,
      status: userStatus,
      role: deriveRole(user.customClaims),
      discord_uid: userDiscordUid,
    };
    res.status(200).json(
      {
        status: 200,
        message: "Login successful",
        user: authResponse,
      }
    );
  } catch (e) {
    functions.logger.error("Error when trying to session login", e);
    res.status(500).json({ status: 500, error: "Something went wrong" });
  }
};

/**
 * Verify cookie session. To be fetched by auth state manager.
 * @param req
 * @param res
 */
export const sessionCheck = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const decodedSessionCookie = await auth.verifySessionCookie(
      req.cookies.__session
    );

    if (!decodedSessionCookie) {
      functions.logger.error("Could not find session cookie");
      res
        .status(400)
        .json({ status: 400, error: "Could not find session cookie" });
      return;
    }

    // Get user data to check email verification status
    const user = await auth.getUser(decodedSessionCookie.sub);
    const userDoc = await db.collection("users").doc(user.uid).get();

    const authResponse: AuthResponse = {
      uid: user.uid,
      email: decodedSessionCookie.email ?? "",
      displayName: decodedSessionCookie.name ?? "",
      emailVerified: user.emailVerified,
      status: userDoc.data()?.status ?? APPLICATION_STATUS.NOT_APPLICABLE,
      role: deriveRole(user.customClaims),
      discord_uid: userDoc.data()?.discord_uid,
    };
    res.status(200).json(
      {
        status: 200,
        message: "Session is valid",
        user: authResponse,
      }
    );
    return;
  } catch (e) {
    functions.logger.error("Error when trying to check session", e);
    res.status(400).json({ status: 400, error: e });
  }
};

/**
 * Request password reset by sending email
 */
export const requestPasswordReset = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email } = req.body;

  if (!email || !validator.isEmail(email)) {
    res.status(400).json({
      status: 400,
      error: "Valid email is required",
    });
    return;
  }

  try {
    // Check if user exists
    await auth.getUserByEmail(email);

    if (process.env.NODE_ENV !== "development") {
      const passwordResetLink = await auth.generatePasswordResetLink(email);
      await sendResetPasswordEmail(email, passwordResetLink);
    }

    // Send success response
    res.status(200).json({
      status: 200,
      message:
        "If an account exists with this email, a password reset link has been sent",
    });
  } catch (error) {
    const err = error as FirebaseError;
    functions.logger.error("Error in password reset process:", err);

    // Send generic response for security
    res.status(200).json({
      status: 200,
      message:
        "If an account exists with this email, a password reset link has been sent",
    });
  }
};

/**
 * Send verification email to user
 */
export const verifyAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const decodedSessionCookie = await auth.verifySessionCookie(
      req.cookies.__session
    );

    if (!decodedSessionCookie) {
      functions.logger.error("Could not find session cookie");
      res
        .status(400)
        .json({ status: 400, error: "Could not find session cookie" });
      return;
    }

    const email = decodedSessionCookie.email;
    if (!email) {
      res.status(400).json({
        status: 400,
        error: "Email not found in session",
      });
      return;
    }

    if (process.env.NODE_ENV !== "development") {
      const verificationLink = await auth.generateEmailVerificationLink(email);
      await sendEmailVerificationEmail(email, verificationLink);
    }

    res.status(200).json({
      status: 200,
      message: "Email verification link sent",
    });
  } catch (error) {
    const err = error as FirebaseError;
    functions.logger.error("Error in account verification:", err);

    res.status(400).json({
      status: 400,
      error: "Something went wrong",
    });
  }
};

export const getCurrentUserRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    /**
     * Check request:
     * 1. Cookie must be present in header.
     */
    const uid = req.user?.uid
    if (req.user === undefined) {
      res.status(401).json({
        status: 401,
        error: "Unauthorized"
      })
      return;
    }
    if (!uid || uid === undefined) {
      res.status(401).json({
        status: 401,
        error: "Unauthorized"
      })
      return;
    }

    /**
     * Process request:
     * 1. Get claims of a user. If none, then default to hacker.
     */
    if (req.user.mentor === true) {
      res.status(200).json({
        status: 200,
        role: "mentor"
      })
      return;
    }

    res.status(200).json({
      status: 200,
      role: "hacker"
    })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
}

/**
 * Sign-in or sign-up using Discord.
 * For a new user where email is not present in auth, it will
 * create a new auth row with provider `email`. The user data
 * in the collection will be marked as discord:<id>.
 * @param req 
 * @param res 
 */
export const authDiscord = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { code, intent } = req.body;
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!
    })
    // exchange code for token from Discord
    const AUTH_URL = "https://discord.com/api/oauth2/token"
    const tokenResponse = await axios.post(AUTH_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    const { access_token: accessToken } = tokenResponse.data
    // get user's info
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    const { id, avatarId, email, verified, global_name: globalName } = userResponse.data
    functions.logger.info("authDiscord: discord profile", { intent, id, email, verified });
    const uid = `discord:${id}`
    const avatarUrl = `https://cdn.discordapp.com/avatars/${uid}/${avatarId}.png`
    const userEmail = `${email}`

    if (intent === "connect") {
      const sessionCookie = req.cookies.__session;
      if (!sessionCookie) { // verify existing session
        res.status(401).json({ status: 401, error: "Unauthorized" });
        return;
      }
      let decodedSession;
      try {
        decodedSession = await auth.verifySessionCookie(sessionCookie, true);
      } catch {
        res.status(401).json({ status: 401, error: "Invalid session" });
        return;
      }
      const callerUid = decodedSession.uid;
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerData = callerDoc.data();
      if (callerData?.provider === "Discord") { // reject user that uses Discord provider
        res.status(400).json({ status: 400, error: "Discord users cannot connect another Discord account" });
        return;
      }
      if (callerData?.discord_uid) { // prevent duplicate links
        res.status(409).json({ status: 409, error: "A Discord account is already connected" });
        return;
      }
      await db.collection("users").doc(callerUid).update({ // update discord uid
        discord_uid: id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.status(200).json({ status: 200, message: "Discord account connected successfully" });
      return;
    }

    try {
      // check if user exist
      const existingUser = await auth.getUserByEmail(email)
      // if the email already belongs to a different (non-discord) account
      // (e.g. Google or email/password), block the discord sign-in to avoid
      // forking a separate discord:<id> identity for the same person.
      if (existingUser.uid !== uid) {
        res.status(409).json({
          status: 409,
          error: "This email is already registered with another sign-in method. Please log in with that method instead.",
        });
        return;
      }
    } catch (error: any) {
      const err = error as FirebaseError
      if (err.code === "auth/user-not-found" && intent === "signup") { // if not found -> new user. init a record
        // create auth user first so Firestore doc isn't orphaned on failure
        const user = await auth.createUser({
          "uid": uid,
          "displayName": globalName,
          "email": email,
          "emailVerified": verified,
          "photoURL": avatarUrl,
        });
        await auth.setCustomUserClaims(user.uid, {
          role: "User",
        });
        const userData: User = {
          userId: uid,
          email: userEmail,
          displayName: globalName ?? "",
          status: APPLICATION_STATUS.NOT_APPLICABLE,
          discord_uid: id,
        };
        await db.collection("users").doc(uid).set({
          ...userData,
          provider: "Discord",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (err.code === "auth/user-not-found" && intent === "signin") {
        functions.logger.error("Error when trying to log in:", err.message);
        res.status(404).json({ status: 404, error: "No account found. Please sign up first." });
        return
      } else {
        throw err
      }
    }

    // then do session login
    const customToken = await auth.createCustomToken(uid, {
      role: "User",
      provider: "Discord"
    })

    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;
    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.WEB_API_KEY}`;

    const signInResponse = await axios.post(url, {
      token: customToken,
      returnSecureToken: true
    })
    const { idToken } = signInResponse.data;
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRY_SECONDS })

    res.cookie("__session", sessionCookie, {
      httpOnly: true,
      maxAge: SESSION_EXPIRY_SECONDS,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    const csrfToken = generateCsrfToken();
    // http only cookie
    res.cookie("CSRF-TOKEN", csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    // non http only cookie
    res.cookie("XSRF-TOKEN", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    const [userDoc, signedInUser] = await Promise.all([
      db.collection("users").doc(uid).get(),
      auth.getUser(uid),
    ]);
    const authResponse: AuthResponse = {
      uid,
      email: signedInUser.email ?? email,
      displayName: signedInUser.displayName ?? globalName,
      emailVerified: signedInUser.emailVerified,
      status: userDoc.data()?.status ?? APPLICATION_STATUS.NOT_APPLICABLE,
      role: deriveRole(signedInUser.customClaims),
      discord_uid: userDoc.data()?.discord_uid,
    };
    res.status(200).json(
      {
        status: 200,
        message: "Login successful",
        user: authResponse,
      }
    );
  } catch (error) {
    functions.logger.error(error)
    if (axios.isAxiosError(error)) {
      res.status(error.response?.status ?? 500).json({ error: error.response?.data ?? error.message })
    } else {
      res.status(500).json({ error: (error as Error).message })
    }
  }
}

export const authDiscordMobile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: "Missing 'code' in request body" });
      return;
    }

    // 1. Exchange code for Discord access token
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_MOBILE_URI!,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // 2. Get Discord profile
    const profileRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const { id, email, username, avatar, global_name: globalName } = profileRes.data;
    const uid = `discord:${id}`;
    const displayName = globalName ?? username;
    const avatarUrl = avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
      : null;

    // 3. Check if user exists in Firestore
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "No account found. Please register first." });
      return;
    }

    // 4. Ensure Firebase Auth user exists + mint token IN PARALLEL
    const [, customToken] = await Promise.all([
      auth.getUser(uid).catch(() =>
        auth.createUser({
          uid,
          displayName,
          email: email ?? undefined,
          photoURL: avatarUrl ?? undefined,
        })
      ),
      auth.createCustomToken(uid),
    ]);

    res.status(200).json({ customToken });

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error?.response?.data ?? error.message });
  }
};

export const authDiscordMobileCallback = async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query;

  if (error) {
    res.redirect(`garudahacks://discord-callback?error=${error}`);
    return;
  }

  if (!code) {
    res.redirect(`garudahacks://discord-callback?error=missing_code`);
    return;
  }

  res.redirect(`garudahacks://discord-callback?code=${code}`);
};
// interface providerUser {
//   id: string
//   email: string
//   username: string
// }
// export const handleOAuthLogin(provider: string, providerUser: providerUser) {
//   let account = await db.
// }

// {"id":"305684499763691523","username":"_heryan","avatar":"4ade4d3fc38818f7e92da464b915456b","discriminator":"0","public_flags":0,"flags":0,"banner":null,"accent_color":1453968,"global_name":"Ryan","avatar_decoration_data":null,"collectibles":null,"display_name_styles":null,"banner_color":"#162f90","clan":null,"primary_guild":null,"mfa_enabled":false,"locale":"en-US","premium_type":0,"email":"heryandjaruma@gmail.com","verified":true}

// https://cdn.discordapp.com/avatars/305684499763691523/4ade4d3fc38818f7e92da464b915456b.png