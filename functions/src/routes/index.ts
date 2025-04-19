import express, { Router } from "express";
import authRoutes from "./auth";
import userRoutes from "./user";
import ticketRoutes from "./ticket";

const router: Router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/tickets", ticketRoutes);

export default router;
