import express, { NextFunction, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import routes from "./routes";
import cookieParser from "cookie-parser";
import * as functions from "firebase-functions";
import { csrfProtection } from "./middlewares/csrf_middleware";
import { validateSessionCookie } from "./middlewares/auth_middleware";

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "https://garudahacks.com",
  "https://portal.garudahacks.com",
  "https://preview.portal.garudahacks.com",
];

const corsOptions: CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in the allowed list
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }

    return callback(null, true);
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-XSRF-TOKEN"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS with options
app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.use(cookieParser());
app.use(express.json());

// Auth validation
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS") {
    return next();
  }
  validateSessionCookie(req, res, next);
});

// CSRF protection as we use session cookie for authentication
app.use(csrfProtection);

// Logging
const sanitizeBody = (body: any): any => {
  if (!body) return body;

  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "credit_card",
    "ssn",
    "social_security",
  ];

  const sanitized = { ...body };

  Object.keys(sanitized).forEach((key) => {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  });

  return sanitized;
};

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
    logData.body = sanitizeBody(req.body);
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
