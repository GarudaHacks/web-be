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
}

const template = readFileSync(join(__dirname, "mentorshipBooked.html"), "utf-8");

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
    .replace(/\$\{portalLink\}/g, props.portalLink);
}
