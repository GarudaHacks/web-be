import express, {Request, Response} from "express";
import {
  login,
  logout,
  register,
  sessionLogin,
} from "../controllers/auth_controller";

const router = express.Router();

router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));
router.post("/session-login", (req: Request, res: Response) => sessionLogin(req, res))
router.post("/logout", (req: Request, res: Response) =>
  logout(req, res)
);

export default router;
