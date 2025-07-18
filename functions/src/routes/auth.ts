import express, { Request, Response } from "express";
import {
  getCurrentUserRole,
  login,
  logout,
  register,
  requestPasswordReset,
  sessionCheck,
  sessionLogin,
  verifyAccount,
} from "../controllers/auth_controller";

const router = express.Router();

router.get("/role", (req: Request, res: Response) => getCurrentUserRole(req, res))
router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));
router.post("/reset-password", requestPasswordReset);
router.post("/verify-account", (req: Request, res: Response) =>
  verifyAccount(req, res)
);
router.post("/session-login", (req: Request, res: Response) =>
  sessionLogin(req, res)
);
router.get("/session-check", (req: Request, res: Response) =>
  sessionCheck(req, res)
);
router.post("/logout", (req: Request, res: Response) => logout(req, res));

export default router;
