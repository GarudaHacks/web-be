import { readFileSync } from "fs";
import { join } from "path";

const template = readFileSync(join(__dirname, "applicationSubmitted.html"), "utf-8");

export function applicationSubmitted(): string {
  return template
}