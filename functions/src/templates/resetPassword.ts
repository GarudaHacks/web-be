import { readFileSync } from "fs";
import { join } from "path";

interface ResetPasswordProps {
  actionUrl: string;
}

const template = readFileSync(join(__dirname, "resetPassword.html"), "utf-8");

export function resetPassword({ actionUrl }: ResetPasswordProps): string {
  return template
    .replace(/\$\{actionUrl\}/g, actionUrl);
}