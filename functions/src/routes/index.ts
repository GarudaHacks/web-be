import express, { Router } from "express";
import authRoutes from "./auth";
import applicationRoutes from "./application";
import userRoutes from "./user";
import ticketRoutes from "./ticket";

const router: Router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/application", applicationRoutes)
router.use("/tickets", ticketRoutes);

export default router;
