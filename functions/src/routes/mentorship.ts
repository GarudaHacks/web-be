import express, { Request, Response } from "express";
import { getMentorshipConfig, hackerBookMentorships, hackerGetMentor, hackerGetMentors, hackerGetMentorSchedule, hackerGetMentorSchedules, mentorGetMyMentorship, mentorGetMyMentorships, mentorPutMyMentorship } from "../controllers/mentorship_controller";
import { isMentor } from "../middlewares/role_middleware";

const router = express.Router();

router.get("/config", async (req: Request, res: Response) => {
  await getMentorshipConfig(req, res);
});

// ****FOR MENTORS ONLY****
router.get("/mentor/my-mentorships", isMentor, (req: Request, res: Response) =>
  mentorGetMyMentorships(req, res)
);

router.get("/mentor/my-mentorships/:id", isMentor, async (req: Request, res: Response) => {
  await mentorGetMyMentorship(req, res)
});

router.post("/mentor/my-mentorships/:id", isMentor, (req: Request, res: Response) =>
  mentorPutMyMentorship(req, res)
);

// ****FOR HACKERS ONLY****
router.get("/hacker/mentors", async (req: Request, res: Response) => {
  await hackerGetMentors(req, res)
});
router.get("/hacker/mentors/:id", async (req: Request, res: Response) => {
  await hackerGetMentor(req, res)
});
router.get("/hacker/mentorships", async (req: Request, res: Response) => {
  await hackerGetMentorSchedules(req, res)
});
router.get("/hacker/mentorships/:id", async (req: Request, res: Response) => {
  await hackerGetMentorSchedule(req, res)
});
router.post("/hacker/mentorships/book", async (req: Request, res: Response) => {
  await hackerBookMentorships(req, res)
})


// router.get("/mentors", (req: Request, res: Response) => getMentors(req, res))
// router.get("/mentors/:mentorId", (req: Request, res: Response) => getMentor(req, res))
// router.get("/mentorships/:mentorId", (req: Request, res: Response) => getMentorshipAppointmentsByMentorId(req, res))
// router.post("/mentorships", (req: Request, res: Response) => bookAMentorshipAppointment(req, res))
// router.get("/my-mentorships", (req: Request, res: Response) => getMyMentorshipAppointments(req, res))

export default router;