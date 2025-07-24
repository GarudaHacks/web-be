import express, { Request, Response } from "express";
import { getMentorSchedules, getMentorshipConfig, hackerBookMentorships, hackerCancelMentorship, hackerGetMentor, hackerGetMentors, hackerGetMentorSchedule, hackerGetMentorSchedules, hackerGetMyMentorship, hackerGetMyMentorships, mentorGetMyMentorship, mentorGetMyMentorships, mentorPutMyMentorship } from "../controllers/mentorship_controller";
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
router.get("/hacker/mentorshipss", async (req: Request, res: Response) => {
  await hackerGetMentorSchedules(req, res)
});
router.get("/hacker/mentorships/:id", async (req: Request, res: Response) => {
  await hackerGetMentorSchedule(req, res)
});
router.get("/hacker/mentorships/:id", async (req: Request, res: Response) => {
  await hackerGetMentorSchedule(req, res)
});
router.post("/hacker/mentorships/book", async (req: Request, res: Response) => {
  await hackerBookMentorships(req, res)
})
router.post("/hacker/mentorships/cancel", async (req: Request, res: Response) => {
  await hackerCancelMentorship(req, res)
})
router.get("/hacker/my-mentorships", async (req: Request, res: Response) => {
  await hackerGetMyMentorships(req, res)
})
router.get("/hacker/my-mentorships/:id", async (req: Request, res: Response) => {
  await hackerGetMyMentorship(req, res)
})

router.get("/hacker/mentorSchedules", async (req: Request, res: Response) => {
  await getMentorSchedules(req, res)
})

export default router;