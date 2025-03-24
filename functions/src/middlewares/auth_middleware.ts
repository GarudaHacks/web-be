import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

// Extend Express Request interface to include the user property.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
    }
  }
}

const app = express();

// Setup middleware
const corsMiddleware = cors({ origin: true });

app.use(corsMiddleware);
app.use(cookieParser());

/**
 * Middleware that validates Firebase ID Tokens passed in the Authorization HTTP header or as a __session cookie.
 * The token should be provided as a Bearer token in the Authorization header or as a __session cookie.
 */
export const validateFirebaseIdToken = async (
  // Export the middleware function
  req: Request,
  res: Response,
  next: NextFunction
) => {
  functions.logger.log(
    "Checking if request is authorized with Firebase ID token"
  );

  // Check for token in Authorization header or __session cookie.
  if (
    (!req.headers.authorization ||
      !req.headers.authorization.startsWith("Bearer ")) &&
    !(req.cookies && req.cookies.__session)
  ) {
    functions.logger.error(
      "No Firebase ID token was passed. " +
        "Make sure to include an Authorization header with \"Bearer <Firebase ID Token>\" or a \"__session\" cookie."
    );
    res.status(403).send("Unauthorized");
    return;
  }

  let idToken: string;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    functions.logger.log("Found \"Authorization\" header");
    // Extract the token from the header.
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else if (req.cookies) {
    functions.logger.log("Found \"__session\" cookie");
    idToken = req.cookies.__session;
  } else {
    res.status(403).send("Unauthorized");
    return;
  }

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    functions.logger.log("ID Token correctly decoded", decodedIdToken);
    req.user = decodedIdToken;
    next();
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
    res.status(403).send("Unauthorized");
  }
};

app.use(validateFirebaseIdToken);

app.get("/hello", (req: Request, res: Response) => {
  // Use optional chaining in case req.user is undefined.
  res.send(`Hello ${req.user?.name || "user"}`);
});

// Export the Express app as an HTTPS Firebase Function.
export const appFunction = functions.https.onRequest(app);
