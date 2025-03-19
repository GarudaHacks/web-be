import express, { Request, Response } from "express";
import { createUser, getUsers } from "../controllers/users_controller";

const router = express.Router();

router.post("/create", (req: Request, res: Response) => createUser(req, res));
router.get("/", (req: Request, res: Response) => getUsers(req, res));

export default router;
