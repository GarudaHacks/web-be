import express, { Request, Response } from "express";
import { createUser, getUsers } from "../controllers/users_controller";
import { validateFirebaseIdToken } from "../middlewares/auth_middleware";

const router = express.Router();

router.use(validateFirebaseIdToken);

router.get("/", (req: Request, res: Response) => getUsers(req, res));
router.post("/create", (req: Request, res: Response) => createUser(req, res));

export default router;
