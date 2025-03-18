import express, {Request, Response, NextFunction} from "express";
import cors from "cors";
import routes from "./routes";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/", (req: Request, res: Response, next: NextFunction) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});
app.use("/", routes);

app.get("/", (req: Request, res: Response) => {
  res.send("API is running");
});

if (process.env.NODE_ENV !== "production") {
  app.listen(4000, () => {
    console.log("Server running on http://localhost:4000");
  });
}

export default app;
