import { google } from "googleapis";
import { randomUUID } from "crypto";
import * as functions from "firebase-functions";

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";

/**
 * Builds an OAuth2 client authorized as a single Google account (personal or
 * Workspace) via a long-lived refresh token obtained once through
 * `scripts/get_google_calendar_refresh_token.ts`. Returns null when credentials
 * are not configured, so callers can degrade gracefully (booking should never
 * fail just because Meet is unavailable).
 */
function getAuthClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

export interface MentorshipMeetEvent {
  eventId: string;
  meetLink: string;
}

/**
 * Creates a Calendar event with an auto-generated Google Meet link for a mentorship
 * session. Returns null (instead of throwing) when Calendar credentials are missing
 * or Google fails to allocate a link, so the booking flow can proceed without one.
 */
export async function createMentorshipMeetEvent(params: {
  summary: string;
  description?: string;
  startEpochSeconds: number;
  endEpochSeconds: number;
  attendeeEmails: string[];
}): Promise<MentorshipMeetEvent | null> {
  const auth = getAuthClient();
  if (!auth) {
    functions.logger.warn("Google Calendar credentials are not configured; skipping Meet link creation.");
    return null;
  }

  const calendar = google.calendar({ version: "v3", auth });

  try {
    const { data } = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: new Date(params.startEpochSeconds * 1000).toISOString() },
        end: { dateTime: new Date(params.endEpochSeconds * 1000).toISOString() },
        attendees: params.attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    if (!data.id || !data.hangoutLink) {
      functions.logger.error("Calendar event created without a Meet link", { eventId: data.id });
      return null;
    }

    return { eventId: data.id, meetLink: data.hangoutLink };
  } catch (error) {
    functions.logger.error("Failed to create mentorship Meet event:", (error as Error).message);
    return null;
  }
}

/**
 * Cancels (deletes) a previously created mentorship Calendar event. No-ops when
 * Calendar credentials are missing, and swallows already-gone errors.
 */
export async function cancelMentorshipMeetEvent(eventId: string): Promise<void> {
  const auth = getAuthClient();
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
      sendUpdates: "all",
    });
  } catch (error: any) {
    if (error?.code === 404 || error?.code === 410) return;
    functions.logger.error("Failed to cancel mentorship Meet event:", (error as Error).message);
  }
}
