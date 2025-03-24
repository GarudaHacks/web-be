import express, { Request, Response } from "express";
import { login, register } from "../controllers/auth_controller";

const router = express.Router();

router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));

export default router;
