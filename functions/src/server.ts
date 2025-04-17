import express, { Request, Response, NextFunction } from "express";
import cors, {CorsOptions} from "cors";
import routes from "./routes";
import cookieParser from "cookie-parser";

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

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/", routes);
app.get("/", (req: Request, res: Response) => {
  res.send("API is running");
});

export default app;
