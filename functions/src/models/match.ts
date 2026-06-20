export enum SwipeDirection {
    LEFT = "left",
    RIGHT = "right",
}

export interface Swipe {
    id?: string; // `${swiperId}_${targetId}`
    swiperId: string;
    targetId: string;
    direction: SwipeDirection;
    createdAt: number; // unix timestamp in seconds
}

export type MatchType = "individual" | "team";

export interface Match {
    id?: string;
    users: [string, string];
    type: MatchType;
    teamId?: string; // only for team matches
    createdAt: number; // unix timestamp in seconds
    discordChannelUrl?: string;
}

export interface MatchCardDTO {
    id: string;
    firstName: string;
    lastName: string;
}

// Stored shape of a `users/{uid}` document.
export type MatchUserDoc = {
    id?: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
    first_name?: string;
    last_name?: string;
    name?: string;
    displayName?: string;
    preferredName?: string;
    email?: string;
    date_of_birth?: string;
    education?: string;
    school?: string;
    gender_identity?: string;
    github?: string;
    linkedin?: string;
    portfolio?: string;
    year?: string;
    status?: string;
    mentor?: boolean;
    admin?: boolean;
    discord_uid?: string;
    match_enabled?: boolean;
    team?: string;
    acceptedAt?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
};

// Stored shape of a `hack_cards/{uid}` document (client writes snake_case).
export type HackCardDoc = {
    uid?: string;
    username?: string;
    role?: string;
    skills?: string[];
    short_bio?: string;
    project_interest?: string;
    avatar_url?: string | null;
    created_at?: unknown;
};

// Stored shape of a `teams/{teamId}` document.
export type TeamDoc = {
    id?: string;
    name?: string;
    leader?: string;
    members?: string[];
    createdAt?: unknown;
};

export type TeamCardDoc = {
    teamId?: string;
    role?: string;
    skills?: string[];
    short_bio?: string;
    project_interest?: string;
    created_at?: unknown;
};


// Profile fields sourced from the `hack_cards` collection.
export interface HackCardProfile {
    username: string;
    role: string;
    skills: string[];
    shortBio: string;
    projectInterest: string;
    avatarUrl: string;
}

// Deck/swipe card: identity (from `users`) + hack-card profile.
export interface MatchDeckCardDTO extends MatchCardDTO, HackCardProfile {
    discord_uid: string;
    discord_username: string;
}

// Post-match detail: everything on the deck card plus contact info.
export interface MatchDetailDTO extends MatchDeckCardDTO {
    discord: string;
}

export const formatMatchCard = (
  data: Partial<MatchCardDTO> & { id?: string }
): MatchCardDTO => ({
  id: data.id || "",
  firstName: data.firstName || "",
  lastName: data.lastName || "",
});

export const formatMatchDeckCard = (
  data: Partial<MatchDeckCardDTO> & { id?: string }
): MatchDeckCardDTO => ({
  id: data.id || "",
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  username: data.username || "",
  role: data.role || "",
  skills: data.skills || [],
  shortBio: data.shortBio || "",
  projectInterest: data.projectInterest || "",
  avatarUrl: data.avatarUrl || "",
  discord_uid: data.discord_uid || "",
  discord_username: data.discord_username || "",
});

export const formatMatchDetail = (
  data: Partial<MatchDetailDTO> & { id?: string }
): MatchDetailDTO => ({
  ...formatMatchDeckCard(data),
  discord: data.discord || "",
});