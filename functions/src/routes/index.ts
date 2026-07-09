import express, { Router } from "express";
import authRoutes from "./auth";
import applicationRoutes from "./application";
import userRoutes from "./user";
import mentorshipRoutes from "./mentorship";
import matchRoutes from "./match";

const router: Router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/application", applicationRoutes)
router.use("/mentorship", mentorshipRoutes)
router.use("/match", matchRoutes);

export default router;