import express, { Request, Response } from "express";
import { hackerGetAvailableMentorSchedules, getMentorshipConfig, hackerBookMentorships, hackerCancelMentorship, hackerGetMentor, hackerGetMentors, hackerGetMentorSchedule, hackerGetMentorSchedules, hackerGetMyMentorship, hackerGetMyMentorships, mentorGetMyMentorship, mentorGetMyMentorships, mentorPutMyMentorship } from "../controllers/mentorship_controller";
import { isConfirmedRSVP, isMentor } from "../middlewares/role_middleware";

const router = express.Router();

router.get("/config", async (req: Request, res: Response) => {
  await getMentorshipConfig(req, res);
});

// ****FOR MENTORS ONLY****
router.get("/mentor/my-mentorships", isMentor, async (req: Request, res: Response) => {
  await mentorGetMyMentorships(req, res);
});

router.get("/mentor/my-mentorships/:id", isMentor, async (req: Request, res: Response) => {
  await mentorGetMyMentorship(req, res)
});

router.post("/mentor/my-mentorships/:id", isMentor, async (req: Request, res: Response) => {
  await mentorPutMyMentorship(req, res);
});

// ****FOR HACKERS ONLY (confirmed RSVP required)****
router.get("/hacker/mentors", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMentors(req, res)
});
router.get("/hacker/mentors/:id", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMentor(req, res)
});
router.get("/hacker/mentorships", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMentorSchedules(req, res)
});
router.get("/hacker/mentorships/:id", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMentorSchedule(req, res)
});
router.post("/hacker/mentorships/book", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerBookMentorships(req, res)
})
router.post("/hacker/mentorships/cancel", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerCancelMentorship(req, res)
})
router.get("/hacker/my-mentorships", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMyMentorships(req, res)
})
router.get("/hacker/my-mentorships/:id", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetMyMentorship(req, res)
})

router.get("/hacker/mentorSchedules", isConfirmedRSVP, async (req: Request, res: Response) => {
  await hackerGetAvailableMentorSchedules(req, res)
})

export default router;