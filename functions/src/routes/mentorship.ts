import express, { Request, Response } from "express";
import { bookAMentorshipAppointment, getMentor, getMentors, getMentorshipAppointmentsByMentorId, getMentorshipConfig, getMyMentorshipAppointments } from "../controllers/mentorship_controller";

const router = express.Router();

router.get("/config", (req: Request, res: Response) => getMentorshipConfig(req, res))
router.get("/mentors", (req: Request, res: Response) => getMentors(req, res))
router.get("/mentors/:mentorId", (req: Request, res: Response) => getMentor(req, res))
router.get("/mentorships/:mentorId", (req: Request, res: Response) => getMentorshipAppointmentsByMentorId(req, res))
router.post("/mentorships", (req: Request, res: Response) => bookAMentorshipAppointment(req, res))
router.get("/my-mentorships", (req: Request, res: Response) => getMyMentorshipAppointments(req, res))

export default router;