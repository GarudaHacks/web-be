import { Request, Response } from "express";
import * as functions from "firebase-functions";
import { db } from "../config/firebase";
import { APPLICATION_STATUS } from "../types/application_types";
import { Match, MatchCardDTO, Swipe, SwipeDirection, formatMatchCard } from "../models/match";
import { MatchConfig } from "../types/config";

const CONFIG = "config";
const MATCH_CONFIG_DOC = "matchConfig";
const USERS = "users";
const SWIPES = "swipes";
const MATCHES = "matches";
const RATE_LIMIT_PER_MINUTE = 15;
const DEFAULT_DECK_SIZE = 10;
const MAX_DECK_SIZE = 50;

type MatchUserDoc = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  school?: string;
  status?: string;
  mentor?: boolean;
  admin?: boolean;
  matchEnabled?: boolean;
  matchEnabledAt?: number;
};

const nowUnixSeconds = (): number => Math.floor(Date.now() / 1000);

const getUidFromRequest = (req: Request): string | null => {
  if (!req.user?.uid) {
    return null;
  }
  return req.user.uid;
};

const parseDeckLimit = (rawLimit: unknown): number => {
  if (!rawLimit) {
    return DEFAULT_DECK_SIZE;
  }

  const numericLimit = parseInt(rawLimit.toString(), 10);
  if (isNaN(numericLimit) || numericLimit <= 0) {
    return DEFAULT_DECK_SIZE;
  }

  return Math.min(numericLimit, MAX_DECK_SIZE);
};

const isUserEligibleForOptIn = (userData: MatchUserDoc): boolean => {
  return (
    userData.status === APPLICATION_STATUS.CONFIRMED_RSVP &&
    userData.mentor !== true &&
    userData.admin !== true
  );
};

const isUserOptedIn = (userData: MatchUserDoc): boolean => {
  return userData.matchEnabled === true;
};

const isUserMatchCandidate = (userData: MatchUserDoc): boolean => {
  return isUserOptedIn(userData) && userData.mentor !== true && userData.admin !== true;
};

const buildMatchCardFromUser = (
  userId: string,
  userData: MatchUserDoc
): MatchCardDTO => {
  const fallbackName = userData.name || "";
  const fallbackParts = fallbackName.trim().split(/\s+/);
  const fallbackFirst = fallbackParts[0] || "";
  const fallbackLast =
    fallbackParts.length > 1 ? fallbackParts.slice(1).join(" ") : "";

  return formatMatchCard({
    id: userId,
    firstName: userData.firstName || fallbackFirst,
    lastName: userData.lastName || fallbackLast,
    school: userData.school || "",
  });
};

const getMatchConfig = async (): Promise<MatchConfig | null> => {
  const snapshot = await db.collection(CONFIG).doc(MATCH_CONFIG_DOC).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as MatchConfig | undefined;
  if (!data) {
    return null;
  }

  return data;
};

const isMatchOpen = async (): Promise<boolean> => {
  const config = await getMatchConfig();
  if (!config) {
    return false;
  }
  return config.isMatchOpen === true;
};

const getCurrentUserDoc = async (
  uid: string
): Promise<{ userData: MatchUserDoc | null; exists: boolean }> => {
  const snapshot = await db.collection(USERS).doc(uid).get();
  if (!snapshot.exists) {
    return { userData: null, exists: false };
  }

  return {
    userData: snapshot.data() as MatchUserDoc,
    exists: true,
  };
};

const getSwipedTargetIds = async (uid: string): Promise<Set<string>> => {
  const snapshot = await db.collection(SWIPES).where("swiperId", "==", uid).get();
  const swipedIds = new Set<string>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data() as Swipe;
    if (data.targetId) {
      swipedIds.add(data.targetId);
    }
  });
  return swipedIds;
};

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const getMatchConfigHandler = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const matchConfig = await getMatchConfig();
    if (!matchConfig) {
      return res.status(400).json({
        status: 400,
        error: "Config not found",
      });
    }

    return res.status(200).json({
      data: matchConfig,
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchConfigHandler: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getMatchStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userData, exists } = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      data: {
        optedIn: isUserOptedIn(userData),
        eligible: isUserEligibleForOptIn(userData),
      },
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchStatus: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const optInToMatch = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userData, exists } = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({ error: "User not found" });
    }

    if (isUserOptedIn(userData)) {
      return res.status(200).json({
        message: "You are already opted in",
      });
    }

    if (!isUserEligibleForOptIn(userData)) {
      return res.status(403).json({
        error: "You are not eligible to opt in",
      });
    }

    await db.collection(USERS).doc(uid).set(
      {
        matchEnabled: true,
        matchEnabledAt: nowUnixSeconds(),
      },
      { merge: true }
    );

    return res.status(200).json({
      message: "Opt-in successful",
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying optInToMatch: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getDeck = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userData, exists } = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!isUserOptedIn(userData)) {
      return res.status(403).json({ error: "You must opt in first" });
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({ error: "Matchmaking is currently closed" });
    }

    const limit = parseDeckLimit(req.query.limit);
    const [swipedTargetIds, optedInUsersSnapshot] = await Promise.all([
      getSwipedTargetIds(uid),
      db.collection(USERS).where("matchEnabled", "==", true).get(),
    ]);

    const availableCards: MatchCardDTO[] = [];
    optedInUsersSnapshot.docs.forEach((doc) => {
      const candidateId = doc.id;
      const candidateData = doc.data() as MatchUserDoc;

      if (candidateId === uid) {
        return;
      }

      if (swipedTargetIds.has(candidateId)) {
        return;
      }

      if (!isUserMatchCandidate(candidateData)) {
        return;
      }

      availableCards.push(buildMatchCardFromUser(candidateId, candidateData));
    });

    const shuffledCards = shuffle(availableCards).slice(0, limit);

    return res.status(200).json({
      data: shuffledCards,
    });
  } catch (error) {
    functions.logger.error(`Error when trying getDeck: ${(error as Error).message}`);
    return res.status(500).json({ error: (error as Error).message });
  }
};

const isValidSwipeDirection = (direction: string): direction is SwipeDirection => {
  return (
    direction === SwipeDirection.LEFT || direction === SwipeDirection.RIGHT
  );
};

const getSortedMatchId = (uidA: string, uidB: string): string => {
  return [uidA, uidB].sort().join("_");
};

export const swipe = async (req: Request, res: Response): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { targetId, direction } = req.body as {
      targetId?: string;
      direction?: string;
    };

    if (!targetId || !direction) {
      return res.status(400).json({
        error: "targetId and direction are required",
      });
    }

    if (!isValidSwipeDirection(direction)) {
      return res.status(400).json({
        error: "direction must be either 'left' or 'right'",
      });
    }

    if (targetId === uid) {
      return res.status(400).json({ error: "You cannot swipe yourself" });
    }

    const { userData: currentUserData, exists: currentUserExists } =
      await getCurrentUserDoc(uid);
    if (!currentUserExists || !currentUserData) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!isUserOptedIn(currentUserData)) {
      return res.status(403).json({ error: "You must opt in first" });
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({ error: "Matchmaking is currently closed" });
    }

    const targetSnapshot = await db.collection(USERS).doc(targetId).get();
    if (!targetSnapshot.exists) {
      return res.status(400).json({ error: "Invalid target user" });
    }

    const targetData = targetSnapshot.data() as MatchUserDoc;
    if (!isUserMatchCandidate(targetData)) {
      return res.status(400).json({ error: "Target user is not available" });
    }

    const currentTime = nowUnixSeconds();
    const rateLimitCutoff = currentTime - 60;
    const recentSwipeSnapshot = await db
      .collection(SWIPES)
      .where("swiperId", "==", uid)
      .where("createdAt", ">", rateLimitCutoff)
      .orderBy("createdAt", "desc")
      .limit(RATE_LIMIT_PER_MINUTE)
      .get();

    if (recentSwipeSnapshot.size >= RATE_LIMIT_PER_MINUTE) {
      return res.status(429).json({
        error: "Too many swipes. Please try again shortly.",
      });
    }

    const ownSwipeDocId = `${uid}_${targetId}`;
    const reciprocalSwipeDocId = `${targetId}_${uid}`;
    const ownSwipeRef = db.collection(SWIPES).doc(ownSwipeDocId);
    const reciprocalSwipeRef = db.collection(SWIPES).doc(reciprocalSwipeDocId);

    let matched = false;
    let matchId: string | null = null;

    await db.runTransaction(async (transaction) => {
      const ownSwipeSnapshot = await transaction.get(ownSwipeRef);
      if (ownSwipeSnapshot.exists) {
        throw new Error("ALREADY_SWIPED");
      }

      let reciprocalSwipeData: Swipe | null = null;
      if (direction === SwipeDirection.RIGHT) {
        const reciprocalSwipeSnapshot = await transaction.get(reciprocalSwipeRef);
        if (reciprocalSwipeSnapshot.exists) {
          reciprocalSwipeData = reciprocalSwipeSnapshot.data() as Swipe;
        }
      }

      transaction.set(ownSwipeRef, {
        swiperId: uid,
        targetId,
        direction,
        createdAt: currentTime,
      } as Swipe);

      if (
        direction === SwipeDirection.RIGHT &&
        reciprocalSwipeData &&
        reciprocalSwipeData.direction === SwipeDirection.RIGHT
      ) {
        matchId = getSortedMatchId(uid, targetId);
        const matchRef = db.collection(MATCHES).doc(matchId);
        const sortedUsers = [uid, targetId].sort() as [string, string];

        transaction.set(matchRef, {
          users: sortedUsers,
          createdAt: currentTime,
        } as Match);
        matched = true;
      }
    });

    return res.status(200).json({
      matched,
      match: matched ? { id: matchId } : null,
    });
  } catch (error) {
    if ((error as Error).message === "ALREADY_SWIPED") {
      return res.status(400).json({
        error: "You have already swiped this user",
      });
    }
    functions.logger.error(`Error when trying swipe: ${(error as Error).message}`);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getMatches = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userData, exists } = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!isUserOptedIn(userData)) {
      return res.status(403).json({ error: "You must opt in first" });
    }

    const matchesSnapshot = await db
      .collection(MATCHES)
      .where("users", "array-contains", uid)
      .get();

    const hydratedMatches = await Promise.all(
      matchesSnapshot.docs.map(async (doc) => {
        const matchData = doc.data() as Match;
        const otherUserId = (matchData.users || []).find((id) => id !== uid);
        if (!otherUserId) {
          return null;
        }

        const otherUserSnapshot = await db.collection(USERS).doc(otherUserId).get();
        if (!otherUserSnapshot.exists) {
          return null;
        }

        const otherUserData = otherUserSnapshot.data() as MatchUserDoc;

        return {
          id: doc.id,
          createdAt: matchData.createdAt,
          user: buildMatchCardFromUser(otherUserId, otherUserData),
        };
      })
    );

    return res.status(200).json({
      data: hydratedMatches.filter((item) => item !== null),
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatches: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getMatchById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const matchSnapshot = await db.collection(MATCHES).doc(id).get();
    if (!matchSnapshot.exists) {
      return res.status(404).json({ error: "Match not found" });
    }

    const matchData = matchSnapshot.data() as Match;
    if (!matchData.users || !matchData.users.includes(uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const otherUserId = matchData.users.find((userId) => userId !== uid);
    if (!otherUserId) {
      return res.status(404).json({ error: "Matched user not found" });
    }

    const otherUserSnapshot = await db.collection(USERS).doc(otherUserId).get();
    if (!otherUserSnapshot.exists) {
      return res.status(404).json({ error: "Matched user not found" });
    }

    const otherUserData = otherUserSnapshot.data() as MatchUserDoc;
    return res.status(200).json({
      data: {
        id: matchSnapshot.id,
        createdAt: matchData.createdAt,
        user: buildMatchCardFromUser(otherUserId, otherUserData),
      },
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchById: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};
