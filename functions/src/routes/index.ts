import express, { Router } from "express";
import authRoutes from "./auth";
import userRoutes from "./user";

const router: Router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);

export default router;
