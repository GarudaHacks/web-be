import express, { Request, Response } from "express";
import { bookAMentorshipAppointment, getMentor, getMentors, getMentorshipAppointmentsByMentorId, getMentorshipConfig, getMyMentorshipAppointments, mentorGetMyMentorship, mentorGetMyMentorships, mentorPutMyMentorship } from "../controllers/mentorship_controller";
import { isMentor } from "../middlewares/role_middleware";

const router = express.Router();

router.get("/config", (req: Request, res: Response) => getMentorshipConfig(req, res))

// ****FOR MENTORS ONLY****
// @ts-ignore
router.get("/mentor/my-mentorships/:id", isMentor, (req: Request, res: Response) => mentorGetMyMentorship(req, res))
// @ts-ignore
router.post("/mentor/my-mentorships/:id", isMentor, (req: Request, res: Response) => mentorPutMyMentorship(req, res))
// @ts-ignore
router.get("/mentor/my-mentorships", isMentor, (req: Request, res: Response) => mentorGetMyMentorships(req, res))

// router.get("/mentors", (req: Request, res: Response) => getMentors(req, res))
// router.get("/mentors/:mentorId", (req: Request, res: Response) => getMentor(req, res))
// router.get("/mentorships/:mentorId", (req: Request, res: Response) => getMentorshipAppointmentsByMentorId(req, res))
// router.post("/mentorships", (req: Request, res: Response) => bookAMentorshipAppointment(req, res))
// router.get("/my-mentorships", (req: Request, res: Response) => getMyMentorshipAppointments(req, res))

export default router;