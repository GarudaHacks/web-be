import express, { Request, Response } from "express";
import { getUsers, getCurrentUser, deleteAccount } from "../controllers/user_controller";
import {convertRequestToCamelCase} from "../utils/camel_case";

const router = express.Router();

router.use(convertRequestToCamelCase);

router.get("/", (req: Request, res: Response) => getUsers(req, res));
router.get("/me", (req: Request, res: Response) => getCurrentUser(req, res));
router.delete("/me", (req: Request, res: Response) => deleteAccount(req, res));

export default router;
