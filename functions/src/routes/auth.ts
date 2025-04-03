import express, { Request, Response } from "express";
import {
  login,
  register,
  refreshToken,
  logout,
} from "../controllers/auth_controller";
import { validateFirebaseIdToken } from "../middlewares/auth_middleware";

const router = express.Router();

router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));
router.post("/refresh-token", (req: Request, res: Response) =>
  refreshToken(req, res)
);
router.post("/logout", validateFirebaseIdToken, (req: Request, res: Response) =>
  logout(req, res)
);

export default router;
