import {Request, Response} from "express";
import * as functions from "firebase-functions";

import {db,admin} from "../config/firebase";
import {APPLICATION_STATUS} from "../types/application_types";
import {MatchConfig} from "../types/config";
import {
  formatMatchCard,
  formatMatchDeckCard, HackCardDoc,
  // formatMatchDetail,
  HackCardProfile, Match, MatchCardDTO,
  MatchDeckCardDTO,
  MatchUserDoc,
  TeamDeckCardDTO,
  // MatchDetailDTO,
  Swipe,
  SwipeDirection, TeamCardDoc, TeamDoc
} from "../models/match";
import {buildMatchNotification, Notification as MatchNotification, NotificationType} from "../models/notification";
import {Timestamp} from "firebase-admin/firestore";

const USERS = "users";
const CONFIG = "config";
const MATCH_CONFIG_DOC = "matchConfig";
const TEAMS = "teams";
const MAX_TEAM_SIZE = 4;
const DEFAULT_DECK_SIZE = 10;
const MAX_DECK_SIZE = 50;
const SWIPES = "swipes";
const HACK_CARDS = "hack_cards";
const NOTIFICATIONS = "notifications";
const RATE_LIMIT_PER_MINUTE = 15;
const MATCHES = "matches";
const TEAM_SWIPES = "team_swipes";
const TEAM_CARDS = "team_cards";
const USER_MOBILE = "user_mobile";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

// VIEW_CHANNEL + SEND_MESSAGES + READ_MESSAGE_HISTORY
const DISCORD_ALLOW_PERMS = "68608";
const DISCORD_DENY_PERMS = "68608";

// In-memory cache so we only fetch/create the category once per cold start
const  cachedCategoryId = "1516580941428953101";



/**
 * Creates a private Discord text channel visible only to the given user IDs.
 * Returns the channel URL, or null if creation fails or config is missing.
 */
const createDiscordPrivateChannel = async (
  channelName: string,
  discordUserIds: string[]
): Promise<string | null> => {
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    functions.logger.warn("DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not set — skipping channel creation");
    return null;
  }

  try {
    const [ permissionOverwrites] = await Promise.all([

      Promise.resolve([
        // Deny @everyone
        {id: DISCORD_GUILD_ID, type: 0, deny: DISCORD_DENY_PERMS, allow: "0"},
        // Allow each matched user
        ...discordUserIds.map((userId) => ({
          id: userId,
          type: 1,
          allow: DISCORD_ALLOW_PERMS,
          deny: "0",
        })),
      ]),
    ]);

    const createRes = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: channelName,
          type: 0, // GUILD_TEXT
          permission_overwrites: permissionOverwrites,
          ...(cachedCategoryId ? {parent_id: cachedCategoryId} : {}),
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      functions.logger.error(`Discord channel creation failed: ${err}`);
      return null;
    }

    const channel = await createRes.json() as {id: string};
    return `https://discord.com/channels/${DISCORD_GUILD_ID}/${channel.id}`;
  } catch (err) {
    functions.logger.error(`Discord channel creation error: ${(err as Error).message}`);
    return null;
  }
};

/**
 * Sends a message to a Discord channel.
 * channelUrl format: https://discord.com/channels/{guildId}/{channelId}
 */
const sendDiscordChannelMessage = async (channelUrl: string, message: string): Promise<void> => {
  if (!DISCORD_BOT_TOKEN) return;

  const channelId = channelUrl.split("/").pop();
  if (!channelId) return;

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({content: message}),
    });

    if (!res.ok) {
      functions.logger.error(`Failed to send channel message: ${await res.text()}`);
    }
  } catch (err) {
    functions.logger.error(`Discord channel message error: ${(err as Error).message}`);
  }
};

/**
 * Looks up the user's push token from user_mobile/{uid}.fcm_token.
 * Returns null if the doc doesn't exist, has no token set, or the lookup fails.
 * Never throws — callers can treat a null return as "don't send".
 */
const getFcmToken = async (uid: string): Promise<string | null> => {
  try {
    const snap = await db.collection(USER_MOBILE).doc(uid).get();
    if (!snap.exists) {
      return null;
    }
    const token = snap.data()?.fcm_token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch (err) {
    functions.logger.error(`Failed to fetch fcm token for ${uid}: ${(err as Error).message}`);
    return null;
  }
};

/**
 * Sends a push notification via FCM. Best-effort: never throws, just logs.
 * Skips silently if no token is provided.
 */
const sendPushNotification = async (
  fcmToken: string | null,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  if (!fcmToken) {
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {title, body},
      ...(data ? {data} : {}),
    });
  } catch (err) {
    functions.logger.error(`Push notification failed: ${(err as Error).message}`);
  }
};

/**
 * Convenience: looks up the user's token then sends. Best-effort, swallows errors.
 * If the user has no fcm_token on file, this is a silent no-op.
 */
const notifyUserPush = async (
  uid: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> => {
  const token = await getFcmToken(uid);
  await sendPushNotification(token, title, body, data);
};

const buildIndividualMatchMessage = (
  discordUid1: string,
  discordUid2: string
): string => `🎉 **It's a Match!** 🎉

Hey <@${discordUid1}> & <@${discordUid2}>! You just matched on **GarudaHacks Speed Dating**! Time to find your dream team. 🚀

─────────────────────────
**Here's what to do next:**
─────────────────────────

**① 💬 Say Hi!**
> Introduce yourselves right here in this channel!

**② 🤝 Get to Know Each Other**
> Share your skills, ideas, and what kind of project you want to build.

**③ 🏗️ Form Your Team**
> If you vibe, one of you creates a team on the **GarudaHacks app**.
> The team leader will get a **Team Code** — share it here!

**④ 📨 Share the Invite Code**
> If you think they're a good match, send your **Team Invitation Code** in this channel so your match can join!

**⑤ ✅ Join the Team**
> Enter the Team Code on the **GarudaHacks app** to officially join.

─────────────────────────
Good luck and happy hacking! 💪⚡`;

const buildTeamMatchMessage = (
  individualDiscordUid: string,
  leaderDiscordUid: string,
  individualName: string,
  teamName: string
): string =>  `🎉 **It's a Match!** 🎉

Hey <@${leaderDiscordUid}> & <@${individualDiscordUid}>! **${individualName}** just matched with team **${teamName}** on **GarudaHacks Speed Dating**! 🚀

─────────────────────────
**Here's what to do next:**
─────────────────────────

**① 💬 Say Hi!**
> Introduce yourselves right here in this channel!

**② 🤝 Get to Know Each Other**
> Share your project idea, tech stack, and what you're each looking for.

**③ 📨 Share the Invite Code**
> If you think they're a good fit, the team leader can send the **Team Invitation Code** here so they can join!

**④ ✅ Join the Team**
> Enter the Team Code on the **GarudaHacks app** to officially join.

─────────────────────────
Good luck and happy hacking! 💪⚡`;


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

// Discord username is sourced from the user's own hack_cards doc
// (hack_cards/{uid}.discord). Falls back to an empty string if the
// hack card doesn't exist or has no discord field set.
const resolveDiscordUsername = (hackCardData: HackCardDoc | null): string => {
  return hackCardData?.discord || "";
};


const nowUnixSeconds = (): number => Math.floor(Date.now() / 1000);


const getUidFromRequest = (req: Request): string | null => {
  if (!req.user?.uid) {
    return null;
  }
  return req.user.uid;
};


const isUserEligibleForOptIn = (userData: MatchUserDoc): boolean => {


  return (
    userData.status === APPLICATION_STATUS.CONFIRMED_RSVP &&
        userData.mentor !== true &&
        userData.admin !== true
  );
};
const isMatchOpen = async (): Promise<boolean> => {
  const config = await getMatchConfig();
  if (!config) {
    return false;
  }
  return config.isMatchOpen === true;
};


const getSortedMatchId = (uidA: string, uidB: string): string => {
  return [uidA, uidB].sort().join("_");
};


const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Batch-fetches hack cards for the given user IDs, keyed by UID. Missing
// cards are simply absent from the map (callers default to empty fields).
const getHackCardsByUserId = async (userIds: string[]): Promise<Map<string, HackCardDoc>> => {
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

  console.log(result)
  return result;
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

// Discord linkage is required to appear in any deck — without it, a match
// can't get a private channel or pings. Exclude users/leaders missing it.
const hasDiscordLinked = (userData: MatchUserDoc | null | undefined): boolean => {
  return !!userData?.discord_uid && userData.discord_uid.length > 0;
};

const isUserOptedIn = (userData: MatchUserDoc): boolean => {
  return userData.match_enabled === true;
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
  });
};

// // Post-match detail: deck card plus contact info (discord).
// const buildMatchDetailFromUser = (
//   userId: string,
//   userData: MatchUserDoc,
//   hackCardData: HackCardDoc | null
// ): MatchDetailDTO => {
//   return formatMatchDetail({
//     ...buildMatchDeckCard(userId, userData, hackCardData),
//     discord: hackCardData?.discord || "",
//   });
// };

// Adds individual to the team, notifies both parties.
// Adds individual to the team, notifies both parties.
const handleTeamMatch = async (
  individualUid: string,
  teamId: string,
  teamData: TeamDoc,
  individualUserData: MatchUserDoc
): Promise<string> => {
  const leaderId = teamData.leader ?? "";
  const now = Timestamp.now();
  const matchId = `${teamId}_${individualUid}`;
  const sortedUsers = [leaderId, individualUid].sort() as [string, string];
  const teamName = teamData.name ?? "";

  // Fetch the individual's hack card so the leader's notification can show
  // the hack_cards username instead of firstName/lastName when available.
  const individualHackCard = (await getHackCardsByUserId([individualUid])).get(individualUid) ?? null;

  // Build cards for notification data
  const individualCard = buildDisplayCard(individualUid, individualUserData, individualHackCard);

  // Fetch leader's discord_uid for private channel creation
  const leaderSnap = leaderId ? await db.collection(USERS).doc(leaderId).get() : null;
  const leaderData = leaderSnap?.exists ? (leaderSnap.data() as MatchUserDoc) : null;

  const discordUserIds = [
    individualUserData.discord_uid,
    leaderData?.discord_uid,
  ].filter((id): id is string => !!id);

  const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);
  const channelName = `match-${sanitize(teamName)}-${sanitize(individualCard.firstName)}`;
  const discordChannelUrl = discordUserIds.length >= 2
    ? await createDiscordPrivateChannel(channelName, discordUserIds)
    : null;

  const individualName = `${individualCard.firstName} ${individualCard.lastName}`.trim();

  await Promise.all([
    db.collection(MATCHES).doc(matchId).set({
      id: matchId,
      users: sortedUsers,
      type: "team",
      teamId,
      createdAt: Math.floor(now.toMillis() / 1000),
      ...(discordChannelUrl ? {discordChannelUrl} : {}),
    } as Match & { id: string; discordChannelUrl?: string }),

    // Individual gets notified: "You matched with team {teamName}"
    db.collection(NOTIFICATIONS).doc(`${individualUid}_match_${matchId}`).set({
      userId: individualUid,
      type: NotificationType.MATCH,
      title: "It's a Match!",
      body: `You matched with team ${teamName}. Say hi!`,
      seen: false,
      refId: matchId,
      data: {matchId, user: individualCard, discordChannelUrl},
      createdAt: now,
    } as MatchNotification),

    // Leader gets notified: "You matched with {individualName}"
    leaderId
      ? db.collection(NOTIFICATIONS).doc(`${leaderId}_match_${matchId}`).set({
        userId: leaderId,
        type: NotificationType.MATCH,
        title: "It's a Match!",
        body: `You matched with ${individualName}`.trim(),
        seen: false,
        refId: matchId,
        data: {matchId, user: individualCard, discordChannelUrl},
        createdAt: now,
      } as MatchNotification)
      : Promise.resolve(),

    // Send message to private channel tagging both users
    discordChannelUrl && individualUserData.discord_uid && leaderData?.discord_uid
      ? sendDiscordChannelMessage(
        discordChannelUrl,
        buildTeamMatchMessage(
          individualUserData.discord_uid,
          leaderData.discord_uid,
          individualName,
          teamName
        )
      )
      : Promise.resolve(),

    // Push notification: individual matched with the team
    notifyUserPush(
      individualUid,
      "It's a Match!",
      `You matched with team ${teamName}. Say hi!`,
      {matchId, type: "team"}
    ),

    // Push notification: leader matched with the individual
    leaderId
      ? notifyUserPush(
        leaderId,
        "It's a Match!",
        `You matched with ${individualName}`.trim(),
        {matchId, type: "team"}
      )
      : Promise.resolve(),
  ]);

  return matchId;
};


const getCurrentUserDoc = async (
  uid: string
): Promise<{ userData: MatchUserDoc | null; exists: boolean }> => {
  const snapshot = await db.collection(USERS).doc(uid).get();
  if (!snapshot.exists) {
    return {userData: null, exists: false};
  }

  return {
    userData: snapshot.data() as MatchUserDoc,
    exists: true,
  };
};


const isUserMatchCandidate = (userData: MatchUserDoc): boolean => {
  return isUserOptedIn(userData) && userData.mentor !== true && userData.admin !== true;
};


const getUserTeamStatus = async (uid: string): Promise<{ inTeam: boolean; isLeader: boolean; teamFull: boolean }> => {
  const snapshot = await db
    .collection(TEAMS)
    .where("members", "array-contains", uid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return {inTeam: false, isLeader: false, teamFull: false};
  }

  const team = snapshot.docs[0].data();
  const memberCount = Array.isArray(team.members) ? team.members.length : 0;
  return {
    inTeam: true,
    isLeader: team.leader === uid,
    teamFull: memberCount >= MAX_TEAM_SIZE,
  };
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
  hackCardData: HackCardDoc | null,
  discordUsername = ""
): MatchDeckCardDTO => {
  const {firstName, lastName} = resolveUserName(userData);

  return formatMatchDeckCard({
    id: userId,
    firstName,
    lastName,
    discord_uid: userData.discord_uid ?? "",
    discord_username: discordUsername,
    ...mapHackCardProfile(hackCardData),
  });
};

const buildTeamDeckCard = async (teamId: string): Promise<TeamDeckCardDTO | null> => {
  const [teamSnap, teamCardSnap] = await Promise.all([
    db.collection(TEAMS).doc(teamId).get(),
    db.collection(TEAM_CARDS).doc(teamId).get(),
  ]);

  if (!teamSnap.exists || !teamCardSnap.exists) {
    return null;
  }

  const teamData = teamSnap.data() as TeamDoc;
  const teamCard = teamCardSnap.data() as TeamCardDoc;
  const memberIds = Array.isArray(teamData.members) ? teamData.members : [];
  const leaderId = teamData.leader ?? "";

  const [allHackCards, memberSnaps] = await Promise.all([
    getHackCardsByUserId(memberIds),
    Promise.all(memberIds.map((id) => db.collection(USERS).doc(id).get())),
  ]);

  const members = memberIds.map((memberId, j) => {
    const userSnap = memberSnaps[j];
    const memberUserData = userSnap.exists ? (userSnap.data() as MatchUserDoc) : null;
    const memberHackCard = allHackCards.get(memberId) ?? null;
    const discordUsername = resolveDiscordUsername(memberHackCard);
    const {firstName, lastName} = resolveUserName(memberUserData ?? {});
    return {
      id: memberId,
      firstName,
      lastName,
      isLeader: memberId === leaderId,
      discord_uid: memberUserData?.discord_uid ?? "",
      discord_username: discordUsername,
      ...mapHackCardProfile(memberHackCard),
    };
  });

  return {
    teamId,
    teamName: teamData.name ?? "",
    memberCount: memberIds.length,
    availableSlots: MAX_TEAM_SIZE - memberIds.length,
    role: teamCard.role ?? "",
    skills: Array.isArray(teamCard.skills) ? teamCard.skills : [],
    shortBio: teamCard.short_bio ?? "",
    projectInterest: teamCard.project_interest ?? "",
    members,
  };
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
    return res.status(500).json({error: (error as Error).message});
  }
};

const isValidSwipeDirection = (direction: string): direction is SwipeDirection => {
  return (
    direction === SwipeDirection.LEFT || direction === SwipeDirection.RIGHT
  );
};

export const getMatchStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {

    // get the user's uid from the request (session login)
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    // get current user's data based on the uid
    const {userData, exists} = await getCurrentUserDoc(uid);

    // if user data is not found, return 404
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
    }

    // get users whether they are inTeam, isLeader, and teamFull based on the uid
    const {inTeam, isLeader, teamFull} = await getUserTeamStatus(uid);

    // scenarios
    // user without no team show team and solo deck
    // user with team and not leader don't show anything about speed dating V
    // user with team and leader only show solo deck
    // user status / eligible is not applicable, it shows "the user is not eligible for opt in / speed dating"
    // user optedIn is false, it shows the button to enable opt in

    return res.status(200).json({
      data: {
        optedIn: isUserOptedIn(userData),
        eligible: isUserEligibleForOptIn(userData),
        isDiscordConnected: !(userData.discord_uid == null || userData.discord_uid === ""),
        inTeam,
        isLeader,
        teamFull,
      },
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchStatus: ${(error as Error).message}`
    );
    return res.status(500).json({error: (error as Error).message});
  }
};

export const optInToMatch = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {

    // get the user's uid from the request (session login)
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    // get current user's data based on the uid
    const {userData, exists} = await getCurrentUserDoc(uid);

    // if user data is not found, return 404
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
    }


    // users already opted in, so they are eligible to continue to get the deck function
    if (isUserOptedIn(userData)) {
      return res.status(200).json({
        message: "You are already opted in",
      });
    }

    // it shows the button to enable opt in
    if (!isUserEligibleForOptIn(userData)) {
      return res.status(403).json({
        error: "You are not eligible to opt in",
      });
    }

    // get users whether they are inTeam, isLeader, and teamFull based on the uid
    const {inTeam, isLeader, teamFull} = await getUserTeamStatus(uid);
    // Block if the user is in a team, unless they are a leader with an open slot.
    // Regular members and leaders of full teams cannot access the deck.
    if (inTeam && !(isLeader && !teamFull)) {
      return res.status(403).json({
        error: "You are already in a team",
      });
    }

    // update the user's matchEnabled field to true to continue to get the deck function
    await db.collection(USERS).doc(uid).set(
      {
        match_enabled: true,
      },
      {merge: true}
    );

    return res.status(200).json({
      message: "Opt-in successful",
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying optInToMatch: ${(error as Error).message}`
    );
    return res.status(500).json({error: (error as Error).message});
  }
};

export const getDeck = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {

    // get the user's uid from the request (session login)
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    // get current user's data based on the uid
    const {userData, exists} = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
    }

    // if user is not opted in, show text in mobile "You must opt in first"
    if (!isUserOptedIn(userData)) {
      return res.status(403).json({error: "You must opt in first"});
    }

    // get users whether they are inTeam, isLeader, and teamFull based on the uid
    const {inTeam, isLeader, teamFull} = await getUserTeamStatus(uid);


    // Block if the user is in a team, unless they are a leader with an open slot.
    // Regular members and leaders of full teams cannot access the deck.
    if (inTeam && !(isLeader && !teamFull)) {
      return res.status(403).json({error: "You are already in a team"});
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({error: "Matchmaking is currently closed"});
    }

    // it determines the number of deck cards to show based on the limit query parameter
    const limit = parseDeckLimit(req.query.limit);


    // basically, just take three collections: swipedTargetIds, optedInUsersSnapshot, and teamsSnapshot
    const [swipedTargetIds, optedInUsersSnapshot, teamsSnapshot] = await Promise.all([
      getSwipedTargetIds(uid),
      db.collection(USERS).where("match_enabled", "==", true).get(),
      db.collection(TEAMS).get(),
    ]);

    // Build a set of all UIDs that belong to any team (leader or member)
    // This set is then used later to exclude these UIDs from the swipe deck — so users who are already in a team won't appear as candidates.
    /*
                              usersInTeam = Set {
                                    "SKyN0Cj9gpWLMNmxjcwHl9z68zh2",  // 5ZPMHC member
                                    "Rk9mP2vXnL4QwZ8jYcT6hB3eA7sN",  // 5ZPMHC member
                                    "Ys7nB4eXkP2mT9wQ5hR1vF6jC8dA",  // F8FSVF member
                                    "Lc3gK7hN5tX8qB2mE4vJ9fW1pR6s",  // F8FSVF member
                                    "QHed6r1dlyMq9xRWdNAYoRGjHij1",  // 2B6LKD member
                                    "PHtgki6o4UhtEjrHAUOkYgJMR1T2",  // 2B6LKD member
                                    "98srcveqjnMdZdyEyct7csaxyGN2",  // 2B6LKD member
                                 }
                             */
    const usersInTeam = new Set<string>();

    teamsSnapshot.docs.forEach((doc) => {

      const team = doc.data();

      if (Array.isArray(team.members)) {
        team.members.forEach((memberId: string) => usersInTeam.add(memberId));
      }

    });


    // eligibleCandidates that are going to be shown in the deck
    const eligibleCandidates: { id: string; data: MatchUserDoc }[] = [];

    // optedInUsersSnapshot shows all users who have matchEnabled == true
    optedInUsersSnapshot.docs.forEach((doc) => {
      const candidateId = doc.id;
      const candidateData = doc.data() as MatchUserDoc;

      // if the candidate is the same as the user, skip it
      if (candidateId === uid) {
        return;
      }

      // if current session login or user already swipe candidate or target id, so there is no same candidate appears twice in the deck
      if (swipedTargetIds.has(candidateId)) {
        return;
      }

      // shows only matchEnable == true, mentor == false, admin == false
      if (!isUserMatchCandidate(candidateData)) {
        return;
      }

      // Skip candidates who haven't linked Discord — they can't be matched into a channel
      if (!hasDiscordLinked(candidateData)) {
        return;
      }


      // Only show solo users — exclude anyone in a team (leader or member)
      if (usersInTeam.has(candidateId)) {
        return;
      }

      eligibleCandidates.push({id: candidateId, data: candidateData});
    });

    // shuffle eligibleCandidates
    const selectedCandidates = shuffle(eligibleCandidates).slice(0, limit);

    // Batch-fetch hack_cards for all selected candidates, keyed by UID.
    // Example result:
    // Map {
    //   "Rk9mP2vXnL4QwZ8jYcT6hB3eA7sN" => {
    //     uid: "", username: "aisha_dev", discord: "aisha_dev#1001",
    //     role: "Frontend", skills: ["React", "TypeScript", "Figma"],
    //     short_bio: "I love building beautiful UIs...",
    //     project_interest: "Social impact apps",
    //     avatar_url: "https://i.pravatar.cc/150?u=U1", created_at: ...
    //   },
    //   "Ys7nB4eXkP2mT9wQ5hR1vF6jC8dA" => {
    //     uid: "", username: "citra_ml", discord: "citra_ml#1003",
    //     role: "ML/AI", skills: ["Python", "TensorFlow", "PyTorch"],
    //     short_bio: "Passionate about making AI explainable and fair.",
    //     project_interest: "Healthcare AI",
    //     avatar_url: "https://i.pravatar.cc/150?u=U3", created_at: ...
    //   }
    // }
    const hackCards = await getHackCardsByUserId(
      selectedCandidates.map((candidate) => candidate.id)
    );

    // Discord usernames now come straight from each candidate's own
    // hack_cards doc (hack_cards/{uid}.discord) — no external API call needed.
    const deckCards: MatchDeckCardDTO[] = selectedCandidates.map((candidate) => {
      const hackCardData = hackCards.get(candidate.id) || null;
      return buildMatchDeckCard(
        candidate.id,
        candidate.data,
        hackCardData,
        resolveDiscordUsername(hackCardData)
      );
    });


    console.log(deckCards);
    console.log(deckCards[0]);

    return res.status(200).json({
      data: deckCards,
    });
  } catch (error) {
    functions.logger.error(`Error when trying getDeck: ${(error as Error).message}`);
    return res.status(500).json({error: (error as Error).message});
  }
};

// Helper: prefer hack_cards username; fall back to firstName/lastName.
// Keeps MatchCardDTO shape unchanged — username (if present) is placed
// into firstName, lastName is cleared, so consumers reading
// `${firstName} ${lastName}`.trim() or `firstName` alone just get the
// username instead.
const buildDisplayCard = (
  userId: string,
  userData: MatchUserDoc,
  hackCardData: HackCardDoc | null
): MatchCardDTO => {
  const baseCard = buildMatchCardFromUser(userId, userData);
  const username = hackCardData?.username || "";
  if (username) {
    return {
      ...baseCard,
      firstName: username,
      lastName: "",
    };
  }
  return baseCard;
};


export const swipe = async (req: Request, res: Response): Promise<Response> => {
  try {

    // get the user's uid from the request (session login)
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    // get current user's data based on the uid
    const {userData: currentUserData, exists: currentUserExists} =
            await getCurrentUserDoc(uid);
    if (!currentUserExists || !currentUserData) {
      return res.status(404).json({error: "User not found"});
    }

    // if user is not opted in, show text in mobile "You must opt in first"
    if (!isUserOptedIn(currentUserData)) {
      return res.status(403).json({error: "You must opt in first"});
    }

    // get users whether they are inTeam, isLeader, and teamFull based on the uid
    const {inTeam, isLeader, teamFull} = await getUserTeamStatus(uid);


    // Block if the user is in a team, unless they are a leader with an open slot.
    // Regular members and leaders of full teams cannot access the deck.
    if (inTeam && !(isLeader && !teamFull)) {
      return res.status(403).json({error: "You are already in a team"});
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({error: "Matchmaking is currently closed"});
    }

    // request body
    const {targetId, direction} = req.body as {
            targetId?: string;
            direction?: string;
        };

    // if targetId is not provided, return 400
    if (!targetId || !direction) {
      return res.status(400).json({
        error: "targetId and direction are required",
      });
    }

    // if targetId is not valid direction, return 400
    if (!isValidSwipeDirection(direction)) {
      return res.status(400).json({
        error: "direction must be either 'left' or 'right'",
      });
    }

    // if he swiped himself, return 400
    if (targetId === uid) {
      return res.status(400).json({error: "You cannot swipe yourself"});
    }

    // if target user does not exist, return 400
    const targetSnapshot = await db.collection(USERS).doc(targetId).get();
    if (!targetSnapshot.exists) {
      return res.status(400).json({error: "Invalid target user"});
    }

    // if matchEnable == true, mentor == false, admin == false -> target user is forbidden to access the deck
    const targetData = targetSnapshot.data() as MatchUserDoc;
    if (!isUserMatchCandidate(targetData)) {
      return res.status(400).json({error: "Target user is not available"});
    }

    //   {
    //     id: "Rk9mP2vXnL4QwZ8jYcT6hB3eA7sN",
    //     firstName: "Aisha",
    //     lastName: "Rahmawati",
    //   }
    // const currentUserCard = buildMatchCardFromUser(uid, currentUserData);
    //
    // //   {
    // //     id: "Rk9mP2vXnL4QwZ8jYcT6hB3eA7sN",
    // //     firstName: "Aisha",
    // //     lastName: "Rahmawati",
    // //   }
    // const targetUserCard = buildMatchCardFromUser(targetId, targetData);


    // Fetch hack cards for both users so notifications can show their
    // hack_cards username instead of firstName/lastName when available.
    const swipeHackCards = await getHackCardsByUserId([uid, targetId]);
    const currentUserHackCard = swipeHackCards.get(uid) ?? null;
    const targetUserHackCard = swipeHackCards.get(targetId) ?? null;

    const currentUserCard = buildDisplayCard(uid, currentUserData, currentUserHackCard);
    const targetUserCard = buildDisplayCard(targetId, targetData, targetUserHackCard);

    // currentime
    const currentTime = nowUnixSeconds();
    const rateLimitCutoff = currentTime - 60;


    // current card that user swiped
    const recentSwipeSnapshot = await db
      .collection(SWIPES)
      .where("swiperId", "==", uid)
      .where("createdAt", ">", rateLimitCutoff)
      .orderBy("createdAt", "desc")
      .limit(RATE_LIMIT_PER_MINUTE)
      .get();

    // if user swiped too many times, return 429
    if (recentSwipeSnapshot.size >= RATE_LIMIT_PER_MINUTE) {
      return res.status(429).json({
        error: "Too many swipes. Please try again shortly.",
      });
    }

    // Swipe doc IDs follow the pattern `{swiperId}_{targetId}`.
    // ownSwipeDocId        = current user's swipe on the target.
    // reciprocalSwipeDocId = target's swipe on the current user (used to detect a mutual match).
    const ownSwipeDocId = `${uid}_${targetId}`;
    const reciprocalSwipeDocId = `${targetId}_${uid}`;
    const ownSwipeRef = db.collection(SWIPES).doc(ownSwipeDocId);
    const reciprocalSwipeRef = db.collection(SWIPES).doc(reciprocalSwipeDocId);

    let matched = false;
    let matchId: string | null = null;

    // Use a Firestore transaction to guarantee atomicity:
    // reading and writing happen as one unit so no two users can
    // create duplicate swipes or matches at the same time.
    await db.runTransaction(async (transaction) => {

      // ALL READS FIRST (Firestore transaction requirement)
      // 1. Read own swipe + reciprocal swipe in parallel
      const [ownSwipeSnapshot, reciprocalSwipeSnapshot] = await Promise.all([
        transaction.get(ownSwipeRef),
        transaction.get(reciprocalSwipeRef),
      ]);

      // Validate: reject duplicate RIGHT swipes, allow LEFT → RIGHT overwrite
      if (ownSwipeSnapshot.exists) {
        const existingDirection = (ownSwipeSnapshot.data() as Swipe).direction;
        if (existingDirection === SwipeDirection.RIGHT) {
          throw new Error("ALREADY_SWIPED");
        }
      }

      // 2. Determine reciprocal match eligibility
      let reciprocalSwipeData: Swipe | null = null;
      if (direction === SwipeDirection.RIGHT && reciprocalSwipeSnapshot.exists) {
        reciprocalSwipeData = reciprocalSwipeSnapshot.data() as Swipe;
      }

      // ALL WRITES AFTER ALL READS
      // 3. Delete old left swipe if overwriting
      if (ownSwipeSnapshot.exists) {
        transaction.delete(ownSwipeRef);
      }

      // 3. Save the current user's swipe to Firestore.
      transaction.set(ownSwipeRef, {
        swiperId: uid,
        targetId,
        direction,
        createdAt: currentTime,
      } as Swipe);

      // 4. If both users swiped RIGHT → it's a match!
      //    Create the match doc and notify both users.
      if (
        direction === SwipeDirection.RIGHT &&
                reciprocalSwipeData &&
                reciprocalSwipeData.direction === SwipeDirection.RIGHT
      ) {
        // matchId is sorted so both users always produce the same doc ID
        // e.g. "Lc3gK7..._Rk9mP2..." regardless of who swiped first.
        matchId = getSortedMatchId(uid, targetId);
        const matchRef = db.collection(MATCHES).doc(matchId);
        const sortedUsers = [uid, targetId].sort() as [string, string];
        const notificationCreatedAt = Timestamp.now();

        // Each user gets notified with the other person's card.
        // currentUser notification shows targetUserCard (who they matched with).
        // targetUser notification shows currentUserCard (who matched them).
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

        // Write match doc and both notifications atomically.
        transaction.set(matchRef, {
          users: sortedUsers,
          type: "individual",
          createdAt: currentTime,
        } as Match);
        transaction.set(
          currentUserNotificationRef,
                    notificationForCurrentUser as MatchNotification
        );
        transaction.set(
          targetUserNotificationRef,
                    notificationForTargetUser as MatchNotification
        );
        matched = true;
      }
    });

    // Create a private Discord channel + send DMs for the matched pair
    let discordChannelUrl: string | null = null;
    if (matched && matchId) {
      const resolvedMatchId = matchId as string;
      const discordUserIds = [currentUserData.discord_uid, targetData.discord_uid]
        .filter((id): id is string => !!id);

      if (discordUserIds.length === 2) {
        const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);
        const channelName = `match-${sanitize(currentUserCard.firstName)}-${sanitize(targetUserCard.firstName)}`;
        discordChannelUrl = await createDiscordPrivateChannel(channelName, discordUserIds);

        if (discordChannelUrl) {
          await db.collection(MATCHES).doc(resolvedMatchId).update({discordChannelUrl});
        }
      }

      // Send message to private channel tagging both users
      if (discordChannelUrl && currentUserData.discord_uid && targetData.discord_uid) {
        await sendDiscordChannelMessage(
          discordChannelUrl,
          buildIndividualMatchMessage(currentUserData.discord_uid, targetData.discord_uid)
        );
      }
    }

    // Push notifications for the matched pair (best-effort — never blocks the response)
    if (matched && matchId) {
      const resolvedMatchId = matchId as string;
      await Promise.all([
        notifyUserPush(
          uid,
          "It's a Match!",
          `You matched with ${targetUserCard.firstName}!`,
          {matchId: resolvedMatchId, type: "individual"}
        ),
        notifyUserPush(
          targetId,
          "It's a Match!",
          `You matched with ${currentUserCard.firstName}!`,
          {matchId: resolvedMatchId, type: "individual"}
        ),
      ]);
    }

    // --- Team match cross-check ---
    // This only runs if the user swiped RIGHT but did NOT get an individual match.
    // Scenario: the current user is a team leader who swiped RIGHT on a solo user.
    // We check if that solo user already swiped RIGHT on the leader's team (via swipeTeam).
    // If yes → mutual interest → trigger a team match (target joins the team).

    if (direction === SwipeDirection.RIGHT && !matched) {

      // Check if the current user is a leader with open slots.
      const {inTeam, isLeader, teamFull} = await getUserTeamStatus(uid);
      if (inTeam && isLeader && !teamFull) {

        // Get the leader's team doc.
        const leaderTeamSnap = await db
          .collection(TEAMS)
          .where("leader", "==", uid)
          .limit(1)
          .get();

        if (!leaderTeamSnap.empty) {
          const leaderTeamDoc = leaderTeamSnap.docs[0];
          const leaderTeamData = leaderTeamDoc.data() as TeamDoc;

          // Check if the target already swiped RIGHT on this team.
          // team_swipes doc ID follows the pattern `{swiperId}_{teamId}`.
          const teamSwipeSnap = await db
            .collection(TEAM_SWIPES)
            .doc(`${targetId}_${leaderTeamDoc.id}`)
            .get();

          // Both sides swiped RIGHT → mutual team match → add target to the team.
          if (teamSwipeSnap.exists && (teamSwipeSnap.data() as any).direction === SwipeDirection.RIGHT) {
            const targetUserData = targetSnapshot.data() as MatchUserDoc;
            await handleTeamMatch(targetId, leaderTeamDoc.id, leaderTeamData, targetUserData);
            matched = true;
          }
        }
      }
    }


    return res.status(200).json({
      matched,
      match: matched ? {id: matchId, discordChannelUrl} : null,
    });
  } catch (error) {
    if ((error as Error).message === "ALREADY_SWIPED") {
      return res.status(400).json({
        error: "You have already swiped this user",
      });
    }
    functions.logger.error(`Error when trying swipe: ${(error as Error).message}`);
    return res.status(500).json({error: (error as Error).message});
  }
};


export const getMatches = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const {userData, exists} = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
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

        // All match notifications (individual and team) use the same doc ID pattern:
        // `{uid}_match_{matchId}`
        const [otherUserSnapshot, notificationSnapshot] = await Promise.all([
          db.collection(USERS).doc(otherUserId).get(),
          db.collection(NOTIFICATIONS).doc(`${uid}_match_${doc.id}`).get(),
        ]);

        if (!otherUserSnapshot.exists) {
          return null;
        }

        const otherUserData = otherUserSnapshot.data() as MatchUserDoc;
        const notificationData = notificationSnapshot.exists
          ? (notificationSnapshot.data() as MatchNotification)
          : null;

        return {
          id: doc.id,
          type: matchData.type ?? "individual",
          teamId: matchData.teamId ?? null,
          createdAt: matchData.createdAt,
          user: buildMatchCardFromUser(otherUserId, otherUserData),
          notification: notificationData
            ? {
              title: notificationData.title,
              body: notificationData.body,
              seen: notificationData.seen,
              createdAt: notificationData.createdAt,
            }
            : null,
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
    return res.status(500).json({error: (error as Error).message});
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

    const matchType = matchData.type ?? "individual";
    const baseResponse = {
      id: matchSnapshot.id,
      type: matchType,
      teamId: matchData.teamId ?? null,
      createdAt: matchData.createdAt,
      discordChannelUrl: matchData.discordChannelUrl ?? null,
    };

    // if (matchType === "team") {
    //   const teamId = matchData.teamId;
    //   if (!teamId) {
    //     return res.status(404).json({ error: "Team not found for this match" });
    //   }
    //
    //   const team = await buildTeamDeckCard(teamId);
    //   if (!team) {
    //     return res.status(404).json({ error: "Team not found" });
    //   }
    //
    //   return res.status(200).json({
    //     data: {
    //       ...baseResponse,
    //       team,
    //     },
    //   });
    // }



    if (matchType === "team") {
      const teamId = matchData.teamId;
      if (!teamId) {
        return res.status(404).json({ error: "Team not found for this match" });
      }

      const teamSnap = await db.collection(TEAMS).doc(teamId).get();
      functions.logger.info({
        exists: teamSnap.exists,
        data: teamSnap.data(),
      });
      const teamData = teamSnap.exists ? (teamSnap.data() as TeamDoc) : null;


      const requesterIsInTeam =
              Array.isArray(teamData?.members) && teamData!.members!.includes(uid);

      if (requesterIsInTeam) {
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
        const discordUsername = resolveDiscordUsername(otherHackCardData);

        return res.status(200).json({
          data: {
            ...baseResponse,
            user: buildMatchDeckCard(otherUserId, otherUserData, otherHackCardData, discordUsername),
          },
        });
      }

      functions.logger.info({
        matchId: id,
        teamId,
        uid,
      });

      const team = await buildTeamDeckCard(teamId);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      return res.status(200).json({
        data: {
          ...baseResponse,
          team,
        },
      });
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
    const discordUsername = resolveDiscordUsername(otherHackCardData);

    return res.status(200).json({
      data: {
        ...baseResponse,
        user: buildMatchDeckCard(otherUserId, otherUserData, otherHackCardData, discordUsername),
      },
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying getMatchById: ${(error as Error).message}`
    );
    return res.status(500).json({ error: (error as Error).message });
  }
};


export const getPassed = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const {userData, exists} = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
    }

    if (!isUserOptedIn(userData)) {
      return res.status(403).json({error: "You must opt in first"});
    }

    // Fetch all left swipes by this user
    const passedSwipesSnap = await db
      .collection(SWIPES)
      .where("swiperId", "==", uid)
      .where("direction", "==", SwipeDirection.LEFT)
      .get();

    if (passedSwipesSnap.empty) {
      return res.status(200).json({data: []});
    }

    const passedUserIds = passedSwipesSnap.docs.map((doc) => (doc.data() as Swipe).targetId);

    // Batch-fetch user docs and hack cards in parallel
    const userRefs = passedUserIds.map((id) => db.collection(USERS).doc(id));
    const [userSnaps, hackCards] = await Promise.all([
      db.getAll(...userRefs),
      getHackCardsByUserId(passedUserIds),
    ]);

    // Discord usernames are read straight off each passed user's hack card —
    // no external API call needed.
    const passedCards = userSnaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const passedUserData = snap.data() as MatchUserDoc;
        const hackCardData = hackCards.get(snap.id) ?? null;
        const discordUsername = resolveDiscordUsername(hackCardData);
        const card  = buildMatchDeckCard(snap.id, passedUserData, hackCardData, discordUsername);

        return {
          ...card,
          firstName: hackCardData?.username ?? "",
          lastName: "",
        };
      });

    return res.status(200).json({data: passedCards});
  } catch (error) {
    functions.logger.error(`Error when trying getPassed: ${(error as Error).message}`);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const getPassedTeams = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const {userData, exists} = await getCurrentUserDoc(uid);
    if (!exists || !userData) {
      return res.status(404).json({error: "User not found"});
    }

    if (!isUserOptedIn(userData)) {
      return res.status(403).json({error: "You must opt in first"});
    }

    // Only individuals (not in any team) can view passed teams
    const {inTeam} = await getUserTeamStatus(uid);
    if (inTeam) {
      return res.status(403).json({error: "You are already in a team"});
    }

    // Fetch left-swiped team IDs from TEAM_SWIPES
    const passedTeamSwipesSnap = await db
      .collection(TEAM_SWIPES)
      .where("swiperId", "==", uid)
      .where("direction", "==", SwipeDirection.LEFT)
      .get();

    if (passedTeamSwipesSnap.empty) {
      return res.status(200).json({data: []});
    }

    const passedTeamIds = passedTeamSwipesSnap.docs.map((doc) => (doc.data() as any).teamId as string);

    // Phase 1: fetch team cards + team docs in parallel
    const teamCardRefs = passedTeamIds.map((id) => db.collection(TEAM_CARDS).doc(id));
    const [teamCardSnaps, teamSnaps] = await Promise.all([
      db.getAll(...teamCardRefs),
      Promise.all(passedTeamIds.map((id) => db.collection(TEAMS).doc(id).get())),
    ]);

    const validTeams = passedTeamIds
      .map((_, i) => ({
        teamCardSnap: teamCardSnaps[i],
        teamSnap: teamSnaps[i],
        teamData: teamSnaps[i].exists ? (teamSnaps[i].data() as TeamDoc) : null,
        memberIds: teamSnaps[i].exists && Array.isArray((teamSnaps[i].data() as TeamDoc).members)
          ? (teamSnaps[i].data() as TeamDoc).members!
          : [],
      }))
      .filter(({teamCardSnap, teamSnap}) => teamCardSnap.exists && teamSnap.exists);

    // Phase 2: fetch all member user docs + hack cards in parallel
    const allMemberIds = [...new Set(validTeams.flatMap((t) => t.memberIds))];

    const [allHackCards, teamMemberSnaps] = await Promise.all([
      getHackCardsByUserId(allMemberIds),
      Promise.all(
        validTeams.map(({memberIds}) =>
          Promise.all(memberIds.map((id) => db.collection(USERS).doc(id).get()))
        )
      ),
    ]);

    // Phase 3: assemble results — discord_username for each member comes
    // straight from that member's own hack_cards doc, no external API needed.
    const teamCards = validTeams.map(({teamCardSnap, teamSnap, teamData, memberIds}, i) => {
      const teamCard = teamCardSnap.data() as TeamCardDoc;
      const leaderId = teamData?.leader ?? "";

      const members = memberIds.map((memberId, j) => {
        const userSnap = teamMemberSnaps[i][j];
        const memberUserData = userSnap.exists ? (userSnap.data() as MatchUserDoc) : null;
        const memberHackCard = allHackCards.get(memberId) ?? null;
        const discordUsername = resolveDiscordUsername(memberHackCard);
        const {firstName, lastName} = resolveUserName(memberUserData ?? {});
        return {
          id: memberId,
          firstName,
          lastName,
          isLeader: memberId === leaderId,
          discord_uid: memberUserData?.discord_uid ?? "",
          discord_username: discordUsername,
          ...mapHackCardProfile(memberHackCard),
        };
      });

      return {
        teamId: teamSnap.id,
        teamName: teamData?.name ?? "",
        memberCount: memberIds.length,
        availableSlots: MAX_TEAM_SIZE - memberIds.length,
        role: teamCard.role ?? "",
        skills: Array.isArray(teamCard.skills) ? teamCard.skills : [],
        shortBio: teamCard.short_bio ?? "",
        projectInterest: teamCard.project_interest ?? "",
        members,
      };
    });

    return res.status(200).json({data: teamCards});
  } catch (error) {
    functions.logger.error(`Error when trying getPassedTeams: ${(error as Error).message}`);
    return res.status(500).json({error: (error as Error).message});
  }
};

export const getTeamDeck = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({error: "Matchmaking is currently closed"});
    }

    // Only individuals (not in any team) can browse the team deck
    const {inTeam} = await getUserTeamStatus(uid);
    if (inTeam) {
      return res.status(403).json({error: "You are already in a team"});
    }

    const [teamCardsSnap, swipedSnap] = await Promise.all([
      db.collection(TEAM_CARDS).get(),
      db.collection(TEAM_SWIPES).where("swiperId", "==", uid).get(),
    ]);

    const swipedTeamIds = new Set(swipedSnap.docs.map((d) => (d.data() as any).teamId as string));

    const eligibleTeamCards = teamCardsSnap.docs.filter(
      (doc) => !swipedTeamIds.has(doc.id)
    );

    // Phase 1: fetch all team docs in parallel
    const teamSnaps = await Promise.all(
      eligibleTeamCards.map((doc) => db.collection(TEAMS).doc(doc.id).get())
    );

    // Fetch each team's leader doc so we can gate on match_enabled/mentor/admin,
    // same as we do for individual candidates in getDeck.
    const leaderIds = eligibleTeamCards.map((doc, i) => {
      const teamData = teamSnaps[i].exists ? (teamSnaps[i].data() as TeamDoc) : null;
      return teamData?.leader ?? "";
    });
    const leaderSnaps = await Promise.all(
      leaderIds.map((leaderId) =>
        leaderId ? db.collection(USERS).doc(leaderId).get() : Promise.resolve(null)
      )
    );

    // Filter out full teams AND teams whose leader hasn't opted in
    // (or is a mentor/admin) — mirrors isUserMatchCandidate gating in getDeck.
    const validTeams = eligibleTeamCards
      .map((doc, i) => {
        const teamData = teamSnaps[i].exists ? (teamSnaps[i].data() as TeamDoc) : null;
        const memberIds = Array.isArray(teamData?.members) ? teamData!.members! : [];
        const leaderSnap = leaderSnaps[i];
        const leaderData = leaderSnap?.exists ? (leaderSnap.data() as MatchUserDoc) : null;
        return {doc, teamData, memberIds, leaderData};
      })
      .filter(({memberIds, leaderData}) =>
        memberIds.length < MAX_TEAM_SIZE &&
                leaderData !== null &&
                isUserMatchCandidate(leaderData) &&
          hasDiscordLinked(leaderData)
      );

    // Phase 2: fetch all member user docs + hack cards in parallel across all teams
    const allMemberIds = [...new Set(validTeams.flatMap((t) => t.memberIds))];

    const [allHackCards, teamMemberSnaps] = await Promise.all([
      getHackCardsByUserId(allMemberIds),
      Promise.all(
        validTeams.map(({memberIds}) =>
          Promise.all(memberIds.map((id) => db.collection(USERS).doc(id).get()))
        )
      ),
    ]);

    // Phase 3: assemble results — discord_username for each member comes
    // straight from that member's own hack_cards doc, no external API needed.
    const teamCards = validTeams.map(({doc, teamData, memberIds}, i) => {
      const teamCard = doc.data() as TeamCardDoc;
      const leaderId = teamData?.leader ?? "";

      const members = memberIds.map((memberId, j) => {
        const userSnap = teamMemberSnaps[i][j];
        const userData = userSnap.exists ? (userSnap.data() as MatchUserDoc) : null;
        const memberHackCard = allHackCards.get(memberId) ?? null;
        const discordUsername = resolveDiscordUsername(memberHackCard);
        const {firstName, lastName} = resolveUserName(userData ?? {});
        return {
          id: memberId,
          firstName,
          lastName,
          isLeader: memberId === leaderId,
          discord_uid: userData?.discord_uid ?? "",
          discord_username: discordUsername,
          ...mapHackCardProfile(memberHackCard),
        };
      });

      return {
        teamId: doc.id,
        teamName: teamData?.name ?? "",
        memberCount: memberIds.length,
        availableSlots: MAX_TEAM_SIZE - memberIds.length,
        role: teamCard.role ?? "",
        skills: Array.isArray(teamCard.skills) ? teamCard.skills : [],
        shortBio: teamCard.short_bio ?? "",
        projectInterest: teamCard.project_interest ?? "",
        members,
      };
    });

    return res.status(200).json({data: teamCards});
  } catch (error) {
    functions.logger.error(
      `Error when trying getTeamDeck: ${(error as Error).message}`
    );
    return res.status(500).json({error: (error as Error).message});
  }
};

export const swipeTeam = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    const currentTime = nowUnixSeconds();
    if (!uid) {
      return res.status(401).json({error: "Unauthorized"});
    }

    const {teamId, direction} = req.body as {
            teamId?: string;
            direction?: string;
        };

    if (!teamId || !direction) {
      return res.status(400).json({error: "teamId and direction are required"});
    }

    if (!isValidSwipeDirection(direction)) {
      return res.status(400).json({error: "direction must be 'left' or 'right'"});
    }

    const matchOpen = await isMatchOpen();
    if (!matchOpen) {
      return res.status(403).json({error: "Matchmaking is currently closed"});
    }

    // Only individuals can swipe on teams
    const {inTeam} = await getUserTeamStatus(uid);
    if (inTeam) {
      return res.status(403).json({error: "You are already in a team"});
    }


    const rateLimitCutoff = currentTime - 60;

    const recentTeamSwipeSnapshot = await db
      .collection(TEAM_SWIPES)
      .where("swiperId", "==", uid)
      .where("createdAt", ">", rateLimitCutoff)
      .orderBy("createdAt", "desc")
      .limit(RATE_LIMIT_PER_MINUTE)
      .get();

    if (recentTeamSwipeSnapshot.size >= RATE_LIMIT_PER_MINUTE) {
      return res.status(429).json({
        error: "Too many swipes. Please try again shortly.",
      });
    }

    // Check already swiped this team
    const existingSwipeSnap = await db
      .collection(TEAM_SWIPES)
      .doc(`${uid}_${teamId}`)
      .get();
    if (existingSwipeSnap.exists) {
      const existingDirection = (existingSwipeSnap.data() as any).direction;
      if (existingDirection === SwipeDirection.RIGHT) {
        return res.status(400).json({error: "You have already swiped this team"});
      }
      // Left → Right: delete old left swipe and proceed
      await db.collection(TEAM_SWIPES).doc(`${uid}_${teamId}`).delete();
    }

    // Validate team exists and is not full
    const teamSnap = await db.collection(TEAMS).doc(teamId).get();
    if (!teamSnap.exists) {
      return res.status(404).json({error: "Team not found"});
    }

    const teamData = teamSnap.data() as TeamDoc;
    const memberCount = Array.isArray(teamData.members) ? teamData.members.length : 0;

    if (Array.isArray(teamData.members) && teamData.members.includes(uid)) {
      return res.status(400).json({error: "You are already a member of this team"});
    }

    if (memberCount >= MAX_TEAM_SIZE) {
      return res.status(400).json({error: "This team is already full"});
    }



    // Save swipe
    await db.collection(TEAM_SWIPES).doc(`${uid}_${teamId}`).set({
      swiperId: uid,
      teamId,
      direction,
      createdAt: currentTime,
    });

    let teamJoined = false;

    if (direction === SwipeDirection.RIGHT) {
      const leaderId = teamData.leader ?? "";

      // Cross-check: did the leader already swipe RIGHT on this individual?
      const leaderSwipeSnap = await db
        .collection(SWIPES)
        .doc(`${leaderId}_${uid}`)
        .get();

      if (leaderSwipeSnap.exists && (leaderSwipeSnap.data() as any).direction === SwipeDirection.RIGHT) {
        // Mutual match → trigger team match and notify both parties
        const individualUserSnap = await db.collection(USERS).doc(uid).get();
        const individualUserData = individualUserSnap.exists
          ? (individualUserSnap.data() as MatchUserDoc)
          : {};

        const expectedMatchId = `${teamId}_${uid}`;
        const existingMatchSnap = await db.collection(MATCHES).doc(expectedMatchId).get();

        if (!existingMatchSnap.exists) {
          await handleTeamMatch(uid, teamId, teamData, individualUserData as MatchUserDoc);
          teamJoined = true;
        }

        // not that important
        // await handleTeamMatch(uid, teamId, teamData, individualUserData as MatchUserDoc);
        // teamJoined = true;
      }
    }

    return res.status(200).json({
      swiped: true,
      direction,
      teamId,
      teamJoined,
    });
  } catch (error) {
    functions.logger.error(
      `Error when trying swipeTeam: ${(error as Error).message}`
    );
    return res.status(500).json({error: (error as Error).message});
  }
};

export const undoSwipe = async (req: Request, res: Response): Promise<Response> => {
  try {
    const uid = getUidFromRequest(req);
    if (!uid) return res.status(401).json({error: "Unauthorized"});

    const lastSwipeSnap = await db.collection(SWIPES)
      .where("swiperId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (lastSwipeSnap.empty) return res.status(200).json({undone: false});

    const swipeDoc = lastSwipeSnap.docs[0];
    const swipeData = swipeDoc.data() as Swipe;

    await swipeDoc.ref.delete();

    // tambahan kecil: kalau ini menyebabkan match individual, hapus match-nya juga
    if (swipeData.direction === SwipeDirection.RIGHT) {
      const matchId = getSortedMatchId(uid, swipeData.targetId);
      const matchRef = db.collection(MATCHES).doc(matchId);
      const matchSnap = await matchRef.get();
      if (matchSnap.exists && (matchSnap.data() as Match).type === "individual") {
        await matchRef.delete(); // notification biarin aja gak masalah besar
      }
    }

    return res.status(200).json({undone: true});
  } catch (error) {
    return res.status(500).json({error: (error as Error).message});
  }
};