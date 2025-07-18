import express, { Request, Response } from "express";
import { bookAMentorshipAppointment, getMentors, getMentorshipAppointmentsByMentorId, getMyMentorshipAppointments } from "../controllers/mentorship_controller";

const router = express.Router();

router.get("/mentors", (req: Request, res: Response) => getMentors(req, res))
router.get("/mentorships/:mentorId", (req: Request, res: Response) => getMentorshipAppointmentsByMentorId(req, res))
router.post("/mentorships", (req: Request, res: Response) => bookAMentorshipAppointment(req, res))
router.get("/my-mentorships", (req: Request, res: Response) => getMyMentorshipAppointments(req, res))

export default router;