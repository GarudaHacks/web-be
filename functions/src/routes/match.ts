import express, { Request, Response } from "express";
import {
  getDeck,
  getMatchById,
  getMatchConfigHandler,
  getMatches,
  getMatchStatus, getTeamDeck,
  optInToMatch,
  getPassed,
  getPassedTeams,
  swipe, swipeTeam, undoSwipe,
} from "../controllers/match_controller";

const router = express.Router();

router.get("/config", async (req: Request, res: Response) => {
  await getMatchConfigHandler(req, res);
});

router.get("/status", async (req: Request, res: Response) => {
  await getMatchStatus(req, res);
});

router.post("/opt-in", async (req: Request, res: Response) => {
  await optInToMatch(req, res);
});

router.get("/deck", async (req: Request, res: Response) => {
  await getDeck(req, res);
});

router.post("/swipe", async (req: Request, res: Response) => {
  await swipe(req, res);
});

router.get("/matches", async (req: Request, res: Response) => {
  await getMatches(req, res);
});

router.get("/matches/:id", async (req: Request, res: Response) => {
  await getMatchById(req, res);
});


router.get("/team-deck", async (req: Request, res: Response) => {
  await getTeamDeck(req, res);
});

router.post("/team-swipe", async (req: Request, res: Response) => {
  await swipeTeam(req, res);
});


router.delete("/swipe", async (req: Request, res: Response) => {
  await undoSwipe(req, res);
});

router.get("/passed", async (req: Request, res: Response) => {
  await getPassed(req, res);
});

router.get("/passed-teams", async (req: Request, res: Response) => {
  await getPassedTeams(req, res);
});

export default router;