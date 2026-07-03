import { readFileSync } from "fs";
import { join } from "path";
import { HackerMentorshipEmailProps } from "./mentorshipBookedHacker";

const template = readFileSync(join(__dirname, "mentorshipCanceledHacker.html"), "utf-8");

/**
 * Return template for the hacker's Mentorship Canceled confirmation email.
 * @param props
 * @returns
 */
export function mentorshipCanceledHacker(props: HackerMentorshipEmailProps): string {
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
    .replace(/\$\{portalLink\}/g, props.portalLink);
}
