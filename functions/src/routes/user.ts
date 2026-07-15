import express, { Request, Response } from "express";
import { getCurrentUser, deleteAccount, getBoardingPassInfo, findMyTables } from "../controllers/user_controller";
import {convertRequestToCamelCase} from "../utils/camel_case";
import { isConfirmedRSVP } from "../middlewares/role_middleware";

const router = express.Router();

router.use(convertRequestToCamelCase);

router.get("/me", (req: Request, res: Response) => getCurrentUser(req, res));
router.delete("/me", (req: Request, res: Response) => deleteAccount(req, res));
router.get("/boarding-pass", isConfirmedRSVP, (req: Request, res: Response) => getBoardingPassInfo(req, res))
router.get("/find-my-tables", (req: Request, res: Response) => findMyTables(req, res))

export default router;
