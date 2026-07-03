import { readFileSync } from "fs";
import { join } from "path";
import { MentorshipEmailProps, buildMeetSection } from "./mentorshipBooked";

export interface HackerMentorshipEmailProps extends MentorshipEmailProps {
  location: string;
}

const template = readFileSync(join(__dirname, "mentorshipBookedHacker.html"), "utf-8");

/**
 * Return template for the hacker's Mentorship Booked confirmation email.
 * @param props
 * @returns
 */
export function mentorshipBookedHacker(props: HackerMentorshipEmailProps): string {
  return template
    .replace(/\$\{mentorName\}/g, props.mentorName)
    .replace(/\$\{teamName\}/g, props.teamName)
    .replace(/\$\{hackerName\}/g, props.hackerName)
    .replace(/\$\{location\}/g, props.location)
    .replace(/\$\{scheduleWib\}/g, props.scheduleWib)
    .replace(/\$\{scheduleUtc\}/g, props.scheduleUtc)
    .replace(/\$\{schedulePacific\}/g, props.schedulePacific)
    .replace(/\$\{pacificLabel\}/g, props.pacificLabel)
    .replace(/\$\{duration\}/g, String(props.duration))
    .replace(/\$\{portalLink\}/g, props.portalLink)
    .replace(/\$\{meetSection\}/g, buildMeetSection(props.meetLink));
}
