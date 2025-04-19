import express, { Request, Response } from "express";
import { getUsers, getCurrentUser } from "../controllers/user_controller";
import { validateFirebaseIdToken } from "../middlewares/auth_middleware";

const router = express.Router();

router.use(validateFirebaseIdToken);

router.get("/", (req: Request, res: Response) => getUsers(req, res));
router.get("/me", (req: Request, res: Response) => getCurrentUser(req, res));

export default router;
