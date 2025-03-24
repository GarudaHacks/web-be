import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import routes from "./routes";

const app = express();

// Middleware
app.use(cors());
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

// Server
if (process.env.FUNCTIONS_EMULATOR) {
  app.listen(2020, () => {
    console.log("Server running on http://localhost:2020");
  });
}

export default app;
