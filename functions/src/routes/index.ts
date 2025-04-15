import express, { Router } from "express";
import authRoutes from "./auth";
import userRoutes from "./users";
import applicationRoutes from "./application";

const router: Router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/application", applicationRoutes)

export default router;
