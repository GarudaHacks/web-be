import express, { NextFunction, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import routes from "./routes";
import cookieParser from "cookie-parser";
import * as functions from "firebase-functions";
import { csrfProtection } from "./middlewares/csrf_middleware";
import { validateSessionCookie } from "./middlewares/auth_middleware";

const app = express();

const corsOptions: CorsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "https://garudahacks.com",
    "https://www.garudahacks.com",
  ],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-XSRF-TOKEN"],
};

// Middleware
app.options("*", cors(corsOptions)); // preflight
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Auth validation
app.use(validateSessionCookie);

// CSRF protection as we use session cookie for authentication
app.use(csrfProtection);

// Logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const logData = {
    method: req.method,
    path: req.path,
    headers: req.headers,
    cookies: req.cookies,
    authorizationHeader: req.headers.authorization || "Not Present",
    sessionCookie: req.cookies.__session || "Not Present",
    body: undefined,
  };

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    logData.body = req.body;
  }

  const timestamp = new Date().toISOString();
  functions.logger.info(
    `[${timestamp}] Incoming Request Details: ${JSON.stringify(
      logData,
      null,
      2
    )}`
  );
  next();
});

// Routes
app.use("/", routes);
app.get("/", (req: Request, res: Response) => {
  res.send("API is running");
});

export default app;
