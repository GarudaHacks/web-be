import { readFileSync } from "fs";
import { join } from "path";

const template = readFileSync(join(__dirname, "applicationSubmitted.html"), "utf-8");

/**
 * Return a template for Application Submitted.
 * @returns 
 */
export function applicationSubmitted(): string {
  return template
}