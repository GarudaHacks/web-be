import express, { Request, Response } from "express";
import { bookAMentorshipAppointment, getMentors, getMentorshipAppointmentsByMentorId } from "../controllers/mentorship_controller";

const router = express.Router();

router.get("/mentors", (req: Request, res: Response) => getMentors(req, res))
router.get("/mentorships/:mentorId", (req: Request, res: Response) => getMentorshipAppointmentsByMentorId(req, res))
router.post("/mentorships", (req: Request, res: Response) => bookAMentorshipAppointment(req, res))

export default router;