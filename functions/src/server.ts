import express, {Request, Response, NextFunction} from "express";
import cors, {CorsOptions} from "cors";
import routes from "./routes";
import cookieParser from "cookie-parser";
import * as functions from "firebase-functions";
import csrf from "csurf";

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
  allowedHeaders: ["Content-Type", "Authorization"]
}
// Middleware
app.options("*", cors(corsOptions)); // preflight
app.use(cors(corsOptions));
app.use(cookieParser())
app.use(express.json());

const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);
app.all("*", (req: Request, res: Response, next: NextFunction) => {
  res.cookie("XSRF-TOKEN", req.csrfToken());
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const logData = {
    method: req.method,
    path: req.path,
    headers: req.headers,
    cookies: req.cookies,
    body: req.body,
    authorizationHeader: req.headers.authorization || "Not Present",
    sessionCookie: req.cookies.__session || "Not Present"
  };
  const timestamp = new Date().toISOString();
  functions.logger.info(`[${timestamp}] Incoming Request Details: ${JSON.stringify(logData, null, 2)}`);
  next();
});

// Routes
app.use("/", routes);
app.get("/", (req: Request, res: Response) => {
  res.send("API is running");
});

export default app;
