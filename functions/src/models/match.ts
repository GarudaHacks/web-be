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

export interface Match {
  id?: string; // `${uidLow}_${uidHigh}`
  users: [string, string];
  createdAt: number; // unix timestamp in seconds
}

export interface MatchCardDTO {
  id: string;
  firstName: string;
  lastName: string;
  school: string;
}

// Profile fields sourced from the `hack_cards` collection. Surfaced on the
// swipe deck (pre-match) EXCEPT contact info, which is detail-only.
export interface HackCardProfile {
  username: string;
  role: string;
  skills: string[];
  shortBio: string;
  projectInterest: string;
  avatarUrl: string;
}

// Deck/swipe card: identity (from `users`) + public hack-card profile.
// Intentionally excludes `discord` since contact info is only revealed
// after a mutual match.
export interface MatchDeckCardDTO extends MatchCardDTO, HackCardProfile {}

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
  school: data.school || "",
});

export const formatMatchDeckCard = (
  data: Partial<MatchDeckCardDTO> & { id?: string }
): MatchDeckCardDTO => ({
  id: data.id || "",
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  school: data.school || "",
  username: data.username || "",
  role: data.role || "",
  skills: data.skills || [],
  shortBio: data.shortBio || "",
  projectInterest: data.projectInterest || "",
  avatarUrl: data.avatarUrl || "",
});

export const formatMatchDetail = (
  data: Partial<MatchDetailDTO> & { id?: string }
): MatchDetailDTO => ({
  ...formatMatchDeckCard(data),
  discord: data.discord || "",
});
