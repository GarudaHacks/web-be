import { readFileSync } from "fs";
import { join } from "path";

export interface MentorshipEmailProps {
  mentorName: string;
  teamName: string;
  hackerName: string;
  scheduleWib: string;
  scheduleUtc: string;
  schedulePacific: string;
  pacificLabel: string;
  duration: number;
  portalLink: string;
  meetLink?: string; // present when the session is online and Meet creation succeeded
}

const template = readFileSync(join(__dirname, "mentorshipBooked.html"), "utf-8");

/**
 * Renders the "Join Google Meet" button block, or an empty string when there's no link.
 * @param meetLink
 * @returns
 */
export function buildMeetSection(meetLink?: string): string {
  if (!meetLink) return "";
  return `<p style="text-align:center;margin:24px 0;">
          <a href="${meetLink}"
            style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
            Join Google Meet
          </a>
        </p>`;
}

/**
 * Return template for Mentorship Booked Email.
 * @param props
 * @returns
 */
export function mentorshipBooked(props: MentorshipEmailProps): string {
  return template
    .replace(/\$\{mentorName\}/g, props.mentorName)
    .replace(/\$\{teamName\}/g, props.teamName)
    .replace(/\$\{hackerName\}/g, props.hackerName)
    .replace(/\$\{scheduleWib\}/g, props.scheduleWib)
    .replace(/\$\{scheduleUtc\}/g, props.scheduleUtc)
    .replace(/\$\{schedulePacific\}/g, props.schedulePacific)
    .replace(/\$\{pacificLabel\}/g, props.pacificLabel)
    .replace(/\$\{duration\}/g, String(props.duration))
    .replace(/\$\{portalLink\}/g, props.portalLink)
    .replace(/\$\{meetSection\}/g, buildMeetSection(props.meetLink));
}
