import { readFileSync } from "fs";
import { join } from "path";

interface WelcomeEmailProps {
  actionUrl: string;
}

const template = readFileSync(join(__dirname, "welcomeEmail.html"), "utf-8");

/**
 * Return template for Welcome Email.
 * @param param0 
 * @returns 
 */
export function welcomeEmail({ actionUrl }: WelcomeEmailProps): string {
  return template
    .replace(/\$\{actionUrl\}/g, actionUrl);
}