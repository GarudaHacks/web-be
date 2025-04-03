import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import routes from "./routes";
import { convertRequestToCamelCase } from "./utils/camel_case";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(convertRequestToCamelCase);
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
