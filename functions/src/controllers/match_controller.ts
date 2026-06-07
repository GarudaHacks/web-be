import { Request, Response } from "express";
import * as functions from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { APPLICATION_STATUS } from "../types/application_types";
import {
  HackCardProfile,
  Match,
  MatchCardDTO,
  MatchDeckCardDTO,
  MatchDetailDTO,
  Swipe,
  SwipeDirection,
  formatMatchCard,
  formatMatchDeckCard,
  formatMatchDetail,
} from "../models/match";
import { Notification, buildMatchNotification } from "../models/notification";
import { MatchConfig } from "../types/config";

const CONFIG = "config";
const MATCH_CONFIG_DOC = "matchConfig";
const USERS = "users";
const SWIPES = "swipes";
const MATCHES = "matches";
const NOTIFICATIONS = "notifications";
const HACK_CARDS = "hack_cards";
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

// Stored shape of a `hack_cards/{uid}` document (client writes snake_case).
type HackCardDoc = {
  username?: string;
  discord?: string;
  role?: string;
  skills?: string[];
  short_bio?: string;
  project_interest?: string;
  avatar_url?: string | null;
};

const nowUnixSeconds = (): number => Math.floor(Date.now() / 1000);

// Normalizes a hack-card document into the public profile fields. Returns
// empty defaults when the user has no hack card so the DTO stays consistent.
const mapHackCardProfile = (
  hackCardData: HackCardDoc | null
): HackCardProfile => ({
  username: hackCardData?.username || "",
  role: hackCardData?.role || "",
  skills: Array.isArray(hackCardData?.skills) ? hackCardData.skills : [],
  shortBio: hackCardData?.short_bio || "",
  projectInterest: hackCardData?.project_interest || "",
  avatarUrl: hackCardData?.avatar_url || "",
});

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

const resolveUserName = (
  userData: MatchUserDoc
): { firstName: string; lastName: string } => {
  const fallbackName = userData.name || "";
  const fallbackParts = fallbackName.trim().split(/\s+/);
  const fallbackFirst = fallbackParts[0] || "";
  const fallbackLast =
    fallbackParts.length > 1 ? fallbackParts.slice(1).join(" ") : "";

  return {
    firstName: userData.firstName || fallbackFirst,
    lastName: userData.lastName || fallbackLast,
  };
};

// Deck/swipe card: identity from `users` enriched with public hack-card
// profile fields. Contact info (discord) is intentionally excluded here.
const buildMatchDeckCard = (
  userId: string,
  userData: MatchUserDoc,
  hackCardData: HackCardDoc | null
): MatchDeckCardDTO => {
  const { firstName, lastName } = resolveUserName(userData);

  return formatMatchDeckCard({
    id: userId,
    firstName,
    lastName,
    school: userData.school || "",
    ...mapHackCardProfile(hackCardData),
  });
};

// Post-match detail: deck card plus contact info (discord).
const buildMatchDetailFromUser = (
  userId: string,
  userData: MatchUserDoc,
  hackCardData: HackCardDoc | null
): MatchDetailDTO => {
  return formatMatchDetail({
    ...buildMatchDeckCard(userId, userData, hackCardData),
    discord: hackCardData?.discord || "",
  });
};

// Batch-fetches hack cards for the given user IDs, keyed by UID. Missing
// cards are simply absent from the map (callers default to empty fields).
const getHackCardsByUserId = async (
  userIds: string[]
): Promise<Map<string, HackCardDoc>> => {
  const result = new Map<string, HackCardDoc>();
  if (userIds.length === 0) {
    return result;
  }

  const refs = userIds.map((id) => db.collection(HACK_CARDS).doc(id));
  const snapshots = await db.getAll(...refs);
  snapshots.forEach((snapshot) => {
    if (snapshot.exists) {
      result.set(snapshot.id, snapshot.data() as HackCardDoc);
    }
  });

  return result;
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

    const eligibleCandidates: { id: string; data: MatchUserDoc }[] = [];
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

      eligibleCandidates.push({ id: candidateId, data: candidateData });
    });

    const selectedCandidates = shuffle(eligibleCandidates).slice(0, limit);
    const hackCards = await getHackCardsByUserId(
      selectedCandidates.map((candidate) => candidate.id)
    );

    const deckCards: MatchDeckCardDTO[] = selectedCandidates.map((candidate) =>
      buildMatchDeckCard(
        candidate.id,
        candidate.data,
        hackCards.get(candidate.id) || null
      )
    );

    return res.status(200).json({
      data: deckCards,
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
    const currentUserCard = buildMatchCardFromUser(uid, currentUserData);
    const targetUserCard = buildMatchCardFromUser(targetId, targetData);

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
        const notificationCreatedAt = Timestamp.now();
        const notificationForCurrentUser = buildMatchNotification(
          uid,
          matchId,
          targetUserCard,
          notificationCreatedAt
        );
        const notificationForTargetUser = buildMatchNotification(
          targetId,
          matchId,
          currentUserCard,
          notificationCreatedAt
        );
        const currentUserNotificationRef = db
          .collection(NOTIFICATIONS)
          .doc(`${uid}_match_${matchId}`);
        const targetUserNotificationRef = db
          .collection(NOTIFICATIONS)
          .doc(`${targetId}_match_${matchId}`);

        transaction.set(matchRef, {
          users: sortedUsers,
          createdAt: currentTime,
        } as Match);
        transaction.set(
          currentUserNotificationRef,
          notificationForCurrentUser as Notification
        );
        transaction.set(
          targetUserNotificationRef,
          notificationForTargetUser as Notification
        );
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

    const [otherUserSnapshot, otherHackCardSnapshot] = await Promise.all([
      db.collection(USERS).doc(otherUserId).get(),
      db.collection(HACK_CARDS).doc(otherUserId).get(),
    ]);
    if (!otherUserSnapshot.exists) {
      return res.status(404).json({ error: "Matched user not found" });
    }

    const otherUserData = otherUserSnapshot.data() as MatchUserDoc;
    const otherHackCardData = otherHackCardSnapshot.exists
      ? (otherHackCardSnapshot.data() as HackCardDoc)
      : null;
    return res.status(200).json({
      data: {
        id: matchSnapshot.id,
        createdAt: matchData.createdAt,
        user: buildMatchDetailFromUser(
          otherUserId,
          otherUserData,
          otherHackCardData
        ),
      },
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchById: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};
