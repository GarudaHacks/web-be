import { Request, Response } from "express";
import { auth, db } from "../config/firebase";
import axios from "axios";
import validator from "validator";
import { formatUser, User } from "../models/user";
import { FieldValue } from "firebase-admin/firestore";
import { convertResponseToSnakeCase } from "../utils/camel_case";
import * as functions from "firebase-functions";
import { FirebaseError } from "firebase-admin";
import { generateCsrfToken } from "../middlewares/csrf_middleware";
import { APPLICATION_STATUS } from "../types/application_types";
import nodemailer from "nodemailer";

const SESSION_EXPIRY_SECONDS = 14 * 24 * 60 * 60 * 1000; // lasts 2 weeks

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

// Configure Nodemailer to use Mailtrap's SMTP
const transporter = nodemailer.createTransport({
  host: "live.smtp.mailtrap.io",
  port: 587,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS,
  },
});

interface MailOptions {
  from: string | { name: string; address: string };
  to: string;
  subject: string;
  html: string;
  text: string;
}

const createPasswordResetMailOptions = (
  email: string,
  link: string
): MailOptions => ({
  from: {
    name: "Garuda Hacks",
    address: "no-reply@garudahacks.com",
  },
  to: email,
  subject: "Reset your Garuda Hacks password",
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <meta name="color-scheme" content="dark">
        <meta name="supported-color-schemes" content="dark">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #fff; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a;">
        <div style="background-color: #2d2d2d; border-radius: 8px; padding: 30px; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #fff; margin-bottom: 20px; font-size: 32px;">Reset Your Password</h1>
          <p style="color: #e2e8f0; margin-bottom: 25px;">You requested a password reset. Click the button below to choose a new password:</p>
          <a href="${link}" style="background-color: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-bottom: 25px;">Reset Password</a>
          <p style="color: #a0aec0; font-size: 14px; margin-top: 30px; border-top: 1px solid #4a5568; padding-top: 20px;">
            If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
          </p>
          <p style="color: #718096; font-size: 12px; margin-top: 20px;">
            This link will expire in 1 hour for security reasons.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #718096; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.</p>
          <p style="margin-top: 10px;">
            <a href="https://garudahacks.com" style="color: #718096; text-decoration: none;">Visit our website</a> |
            <a href="mailto:hiba@garudahacks.com" style="color: #718096; text-decoration: none;">Contact Support</a>
          </p>
        </div>
      </body>
    </html>
  `,
  text: `Reset Your Password

You requested a password reset. Click the link below to choose a new password:

${link}

If you didn't request this, you can safely ignore this email. Your password will remain unchanged.

This link will expire in 1 hour for security reasons.

© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.`,
});

const sendPasswordResetEmail = async (
  email: string,
  link: string
): Promise<void> => {
  const mailOptions = createPasswordResetMailOptions(email, link);
  await transporter.sendMail(mailOptions);
  functions.logger.info("Password reset email sent successfully to:", email);
};

const createVerificationMailOptions = (
  email: string,
  link: string
): MailOptions => ({
  from: {
    name: "Garuda Hacks",
    address: "no-reply@garudahacks.com",
  },
  to: email,
  subject: "Verify your Garuda Hacks account",
  html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Account</title>
        <meta name="color-scheme" content="dark">
        <meta name="supported-color-schemes" content="dark">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #fff; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a;">
        <div style="background-color: #2d2d2d; border-radius: 8px; padding: 30px; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h1 style="color: #fff; margin-bottom: 20px; font-size: 32px;">Welcome to Garuda Hacks!</h1>
          <p style="color: #e2e8f0; margin-bottom: 25px;">Thank you for registering. Please verify your email address by clicking the button below:</p>
          <a href="${link}" style="background-color: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-bottom: 25px;">Verify Email</a>
          <p style="color: #a0aec0; font-size: 14px; margin-top: 30px; border-top: 1px solid #4a5568; padding-top: 20px;">
            If you didn't create an account with us, you can safely ignore this email.
          </p>
          <p style="color: #718096; font-size: 12px; margin-top: 20px;">
            This verification link will expire in 24 hours.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #718096; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.</p>
          <p style="margin-top: 10px;">
            <a href="https://garudahacks.com" style="color: #718096; text-decoration: none;">Visit our website</a> |
            <a href="mailto:hiba@garudahacks.com" style="color: #718096; text-decoration: none;">Contact Support</a>
          </p>
        </div>
      </body>
    </html>
  `,
  text: `Welcome to Garuda Hacks!

Thank you for registering. Please verify your email address by clicking the link below:

${link}

If you didn't create an account with us, you can safely ignore this email.

This verification link will expire in 24 hours.

© ${new Date().getFullYear()} Garuda Hacks. All rights reserved.`,
});

const sendVerificationEmail = async (
  email: string,
  link: string
): Promise<void> => {
  const mailOptions = createVerificationMailOptions(email, link);
  await transporter.sendMail(mailOptions);
  functions.logger.info("Verification email sent successfully to:", email);
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
    res.status(400).json({ status: 400, error: "Invalid email or password" });
  }
};

/**
 * Registers new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  if (!validateEmailAndPassword(email, password, res)) return;

  try {
    if (!name) {
      res.status(400).json({
        status: 400,
        error: "Name is required",
      });
      return;
    }

    const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined;

    const user = await auth.createUser({
      displayName: name,
      email,
      password,
    });

    // set custom claims to user
    await auth.setCustomUserClaims(user.uid, {
      role: "User",
    });

    // Generate email verification link
    const verificationLink = await auth.generateEmailVerificationLink(email);

    // Send verification email
    await sendVerificationEmail(email, verificationLink);

    const customToken = await auth.createCustomToken(user.uid);

    const url = isEmulator
      ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=dummy-key"
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.WEB_API_KEY}`;

    const token = (
      await axios.post(url, { token: customToken, returnSecureToken: true })
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

    res.status(201).json(
      convertResponseToSnakeCase({
        status: 201,
        message:
          "Registration successful. Please check your email for verification link.",
        user: {
          email: user.email,
          displayName: user.displayName,
        },
      })
    );
  } catch (error) {
    const err = error as Error;
    console.error("error:", err.message);
    res.status(400).json({ status: 400, error: err.message });
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

  try {
    const cookies = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_SECONDS,
    }); // lasts a week

    const decodedIdToken = await auth.verifyIdToken(idToken);

    let user;
    let userDoc;
    if (decodedIdToken.email != null) {
      user = await auth.getUserByEmail(decodedIdToken.email);

      // Get user document from Firestore
      userDoc = await db.collection("users").doc(user.uid).get();

      // Check if user exists in Firestore
      if (!userDoc.exists) {
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
      } else {
        // Check verification status
        if (!decodedIdToken.email_verified) {
          res.status(403).json({
            status: 403,
            error:
              "Account not verified. Please check your email for verification link.",
          });
          return;
        }
      }
    } else {
      functions.logger.error(
        "Could not find existing user with email",
        decodedIdToken.email
      );
      res.status(400).json({ status: 400, error: "Invalid credentials" });
      return;
    }

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

    res.status(200).json({
      status: 200,
      message: "Login successful",
      user: {
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (e) {
    const err = e as FirebaseError;
    if (err.code === "auth/user-not-found") {
      functions.logger.error("User not found", e);
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
    functions.logger.error("Error when trying to session login", e);
    res.status(500).json({ status: 500, error: e });
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
    }

    res.status(200).json({
      status: 200,
      message: "Session is valid",
      data: {
        user: {
          email: decodedSessionCookie.email,
          displayName: decodedSessionCookie.name,
        },
      },
    });
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

    // Generate password reset link
    functions.logger.info("Generating password reset link for:", email);

    const link = await auth.generatePasswordResetLink(email);
    functions.logger.info("Password reset link generated successfully");

    // Send password reset email
    await sendPasswordResetEmail(email, link);

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
 * Verify user account using verification code
 */
export const verifyAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      status: 400,
      error: "Email is required",
    });
    return;
  }

  try {
    const link = await auth.generateEmailVerificationLink(email);

    await sendVerificationEmail(email, link);

    res.status(200).json({
      status: 200,
      message: "Account verified successfully",
    });
  } catch (error) {
    const err = error as FirebaseError;
    functions.logger.error("Error in account verification:", err);

    res.status(400).json({
      status: 400,
      error: "Invalid or expired verification code",
    });
  }
};
