import express, {Router} from "express";
import userRoutes from "./users";

const router: Router = express.Router();

router.use("/users", userRoutes);

export default router;
