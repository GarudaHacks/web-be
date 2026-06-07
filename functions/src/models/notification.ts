import { Timestamp } from "firebase-admin/firestore";
import { MatchCardDTO } from "./match";

export enum NotificationType {
  MATCH = "match",
  // TEAM = "team",
  // SYSTEM = "system",
  // SUBMISSION = "submission",
}

export interface NotificationData {
  matchId: string;
  user: MatchCardDTO;
}

export interface Notification {
  id?: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  seen: boolean;
  refId?: string;
  data?: NotificationData;
  createdAt: Timestamp;
}

export const buildMatchNotification = (
  recipientId: string,
  matchId: string,
  otherUser: MatchCardDTO,
  createdAt: Timestamp = Timestamp.now()
): Notification => ({
  userId: recipientId,
  type: NotificationType.MATCH,
  title: "It's a Match!",
  body: `You matched with ${otherUser.firstName} ${otherUser.lastName}`.trim(),
  seen: false,
  refId: matchId,
  data: {
    matchId,
    user: otherUser,
  },
  createdAt,
});
