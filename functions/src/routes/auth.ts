import express, {Request, Response} from "express";
import {
  invalidateToken,
  login,
  logout,
  refreshToken,
  register,
  sessionLogin,
  tokenSandbox,
} from "../controllers/auth_controller";
import {validateFirebaseIdToken, validateFirebaseRefreshToken} from "../middlewares/auth_middleware";

const router = express.Router();

router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));
router.post("/refresh-token", validateFirebaseRefreshToken, (req: Request, res: Response) =>
  refreshToken(req, res)
);
router.post("/invalidate-token", (req: Request, res: Response) => invalidateToken(req, res));
router.post("/session-login", (req: Request, res: Response) => sessionLogin(req, res))
router.post("/logout", validateFirebaseIdToken, (req: Request, res: Response) =>
  logout(req, res)
);
router.post("/token-sandbox", (req: Request, res: Response) => {tokenSandbox(req, res)});

export default router;
