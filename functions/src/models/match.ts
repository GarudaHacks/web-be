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

export const formatMatchCard = (
  data: Partial<MatchCardDTO> & { id?: string }
): MatchCardDTO => ({
  id: data.id || "",
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  school: data.school || "",
});
