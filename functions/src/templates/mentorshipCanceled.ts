import { readFileSync } from "fs";
import { join } from "path";
import { MentorshipEmailProps } from "./mentorshipBooked";

const template = readFileSync(join(__dirname, "mentorshipCanceled.html"), "utf-8");

/**
 * Return template for Mentorship Canceled Email.
 * @param props
 * @returns
 */
export function mentorshipCanceled(props: MentorshipEmailProps): string {
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
