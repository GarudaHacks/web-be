import express, {Request, Response} from "express";
import {login, logout, refreshToken, register, verifyToken,} from "../controllers/auth_controller";
import {validateFirebaseIdToken} from "../middlewares/auth_middleware";
import {convertRequestToCamelCase} from "../utils/camel_case";

const router = express.Router();

router.use(convertRequestToCamelCase);

router.post("/login", (req: Request, res: Response) => login(req, res));
router.post("/register", (req: Request, res: Response) => register(req, res));
router.post("/refresh-token", (req: Request, res: Response) =>
  refreshToken(req, res)
);
router.post("/set-cookie", (req: Request, res: Response) => verifyToken(req, res))
router.post("/logout", validateFirebaseIdToken, (req: Request, res: Response) =>
  logout(req, res)
);

export default router;
