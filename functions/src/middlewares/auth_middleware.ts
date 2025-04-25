import * as functions from "firebase-functions";
import {admin, auth} from "../config/firebase";
import {NextFunction, Request, Response} from "express";
import {extractRefreshTokenFromCookies, extractSessionFromHeaderOrCookies} from "../utils/jwt";

// Extend Express Request interface to include the user property.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
    }
  }
}

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

  console.log(req.cookies);
  console.log(req.cookies.__session);
  console.log(req.headers.cookie);

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
    res.status(401).json({error: "Unauthorized"});
    return;
  }

  const idToken = extractSessionFromHeaderOrCookies(req);
  if (!idToken) {
    res.status(401).json({error: "Unauthorized"});
    return;
  }

  try {
    const decodedIdToken = await auth.verifyIdToken(idToken, true);
    functions.logger.log("ID Token correctly decoded", decodedIdToken);
    req.user = decodedIdToken;
    next();
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
    res.status(401).json({error: "Unauthorized"});
  }
};

/**
 * Middleware that validates Firebase Session Cookie (refresh token) passed as a refresh-token cookie or body.
 * The token should be provided as a refresh_token cookie or through body argument refresh_token.
 */
export const validateFirebaseRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  functions.logger.log(
    "Checking if request is authorized with Firebase Refresh Token"
  );

  let refreshToken;
  if (req.cookies && req.cookies.refresh_token) {
    refreshToken = extractRefreshTokenFromCookies(req);
  } else if (req.body.refresh_token) {
    refreshToken = req.body.refresh_token;
  }

  // Check for refresh token
  if (!refreshToken) {
    functions.logger.error(
      "No Firebase Refresh Token was passed. " +
      "Make sure to include a refresh_token cookie or body `refresh_token`."
    );
    res.status(401).json({
      status_code: 401,
      error: "Unauthorized"
    });
    return;
  }

  try {
    const decodedRefreshToken = await auth.verifySessionCookie(refreshToken, true);

    functions.logger.log("Refresh Token correctly decoded", decodedRefreshToken);
    console.log("Refresh Token correctly decoded", decodedRefreshToken);
    console.log("Refresh token", refreshToken)
    req.user = refreshToken;
    next();
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
    console.log(error)
    res.status(403).json({error: "Unauthorized"});
  }
};