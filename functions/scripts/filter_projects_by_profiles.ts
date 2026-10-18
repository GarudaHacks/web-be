/**
 * Cross-reference a Devpost projects export with a profile export (e.g. the
 * output of `export_profile_csv.ts --umn`) and write two CSVs:
 *
 *   1. projects_filtered_<ts>.csv - only the projects that have at least one
 *      person from the profile export as submitter or team member. Columns are
 *      the same as the Devpost export, except the trailing "..." header is
 *      expanded into "Team Member N First Name / Last Name / Email".
 *   2. profiles_with_projects_<ts>.csv - the profile export with an extra
 *      `projectName` column (multiple projects joined with "; ", empty if the
 *      person has no project).
 *
 * A person matches a project if either:
 *   - their profile `email` equals the submitter email or a team member email, or
 *   - their profile `firstName lastName` matches (case/accent/punctuation-
 *     insensitive) the submitter name, a name in "Team Members", or a team
 *     member's first + last name - either exactly, or with extra middle names
 *     on the Devpost side (see namesMatch).
 *
 * Purely local - reads and writes CSV files only, no Firestore access.
 *
 * To run (from functions/):
 *   npx tsx scripts/filter_projects_by_profiles.ts \
 *     --projects scripts/.data/<devpost export>.csv \
 *     --profiles scripts/.exports/<profile export>.csv
 *   # optional: --output-dir <dir> (default scripts/.exports)
 */

import * as fs from "fs";
import * as path from "path";

// Fixed-position columns in the Devpost export. Everything from
// FIRST_MEMBER_COLUMN onwards is repeating (first name, last name, email)
// triples, one per additional team member.
const COL_PROJECT_TITLE = "Project Title";
const COL_SUBMITTER_FIRST = "Submitter First Name";
const COL_SUBMITTER_LAST = "Submitter Last Name";
const COL_SUBMITTER_EMAIL = "Submitter Email";
const COL_TEAM_MEMBERS = "Team Members";
const FIRST_MEMBER_COLUMN = "Team Member 1 First Name";

interface ParsedArgs {
  projects: string;
  profiles: string;
  outputDir: string;
}

interface Person {
  emails: Set<string>;
  names: Set<string>;
}

/**
 * Parse --projects, --profiles and --output-dir from argv.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const valueFlags = new Set(["--projects", "--profiles", "--output-dir"]);
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) values[args[i]] = args[++i];
  }
  if (!values["--projects"] || !values["--profiles"]) {
    console.error("usage: --projects <devpost.csv> --profiles <profile_export.csv> [--output-dir <dir>]");
    process.exit(1);
  }
  return {
    projects: path.resolve(values["--projects"]),
    profiles: path.resolve(values["--profiles"]),
    outputDir: path.resolve(values["--output-dir"] ?? path.join(__dirname, ".exports")),
  };
}

/**
 * Parse a CSV file per RFC 4180 (quoted fields may contain commas, quotes and
 * newlines). Strips a leading BOM and skips fully empty lines.
 */
function readCsv(filePath: string): string[][] {
  const text = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/**
 * Escape a single CSV field per RFC 4180.
 */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Serialize rows to CSV text.
 */
function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

/**
 * Normalize a name for comparison: strip accents, lowercase, and replace
 * anything that isn't a letter (list numbering like "1.", "&", invisible
 * characters) with single spaces.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
}

/**
 * True if `profileName` matches `projectName` exactly, or - for names of at
 * least two words - if every profile word appears in order in the project
 * name starting from the same first word, so "angela sunny" matches
 * "angela benedictin sunny" (Devpost names often include middle names).
 */
function namesMatch(profileName: string, projectName: string): boolean {
  if (profileName === projectName) return true;
  const profileWords = profileName.split(" ");
  const projectWords = projectName.split(" ");
  if (profileWords.length < 2 || profileWords[0] !== projectWords[0]) return false;
  let j = 0;
  for (const word of projectWords) {
    if (word === profileWords[j]) j++;
    if (j === profileWords.length) return true;
  }
  return false;
}

/**
 * Normalize an email for comparison.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Build the header for the projects CSV, expanding the trailing "..." into
 * named Team Member columns wide enough for the widest row.
 */
function buildProjectsHeader(header: string[], maxRowLength: number): string[] {
  const firstMemberIdx = header.indexOf(FIRST_MEMBER_COLUMN);
  const fixed = header.slice(0, firstMemberIdx);
  const memberCount = Math.ceil((maxRowLength - firstMemberIdx) / 3);
  for (let n = 1; n <= memberCount; n++) {
    fixed.push(`Team Member ${n} First Name`, `Team Member ${n} Last Name`, `Team Member ${n} Email`);
  }
  return fixed;
}

/**
 * Collect every email and full name attached to a project row.
 */
function getProjectPeople(row: string[], col: (name: string) => number, firstMemberIdx: number): Person {
  const emails = new Set<string>();
  const names = new Set<string>();
  const addName = (name: string) => {
    const normalized = normalizeName(name);
    if (normalized) names.add(normalized);
  };
  const addEmail = (email: string) => {
    const normalized = normalizeEmail(email);
    if (normalized) emails.add(normalized);
  };

  addEmail(row[col(COL_SUBMITTER_EMAIL)] ?? "");
  addName(`${row[col(COL_SUBMITTER_FIRST)] ?? ""} ${row[col(COL_SUBMITTER_LAST)] ?? ""}`);
  (row[col(COL_TEAM_MEMBERS)] ?? "").split(",").forEach(addName);

  for (let i = firstMemberIdx; i < row.length; i += 3) {
    addName(`${row[i] ?? ""} ${row[i + 1] ?? ""}`);
    addEmail(row[i + 2] ?? "");
  }
  return { emails, names };
}

/**
 * Entry point: match profiles to projects and write both CSVs.
 */
function main() {
  const { projects, profiles, outputDir } = parseArgs();

  const [projectsHeader, ...projectRows] = readCsv(projects);
  const [profilesHeader, ...profileRows] = readCsv(profiles);
  console.log(`Projects: ${projectRows.length}, profiles: ${profileRows.length}`);

  const projectCol = (name: string) => {
    const idx = projectsHeader.indexOf(name);
    if (idx === -1) throw new Error(`projects CSV is missing column "${name}"`);
    return idx;
  };
  const profileCol = (name: string) => {
    const idx = profilesHeader.indexOf(name);
    if (idx === -1) throw new Error(`profiles CSV is missing column "${name}"`);
    return idx;
  };
  const firstMemberIdx = projectCol(FIRST_MEMBER_COLUMN);
  const titleIdx = projectCol(COL_PROJECT_TITLE);
  const emailIdx = profileCol("email");
  const firstNameIdx = profileCol("firstName");
  const lastNameIdx = profileCol("lastName");

  const projectPeople = projectRows.map((row) => getProjectPeople(row, projectCol, firstMemberIdx));

  const matchedProjectIdxs = new Set<number>();
  const profileProjects: string[][] = profileRows.map((profile) => {
    const email = normalizeEmail(profile[emailIdx] ?? "");
    const name = normalizeName(`${profile[firstNameIdx] ?? ""} ${profile[lastNameIdx] ?? ""}`);
    const titles: string[] = [];
    projectPeople.forEach((people, i) => {
      const nameMatched = name && [...people.names].some((projectName) => namesMatch(name, projectName));
      if ((email && people.emails.has(email)) || nameMatched) {
        matchedProjectIdxs.add(i);
        titles.push(projectRows[i][titleIdx].trim());
      }
    });
    return titles;
  });

  const maxRowLength = Math.max(...projectRows.map((row) => row.length));
  const filteredProjects = [
    buildProjectsHeader(projectsHeader, maxRowLength),
    ...projectRows.filter((_, i) => matchedProjectIdxs.has(i)),
  ];
  const profilesWithProjects = [
    [...profilesHeader, "projectName"],
    ...profileRows.map((row, i) => [...row, profileProjects[i].join("; ")]),
  ];

  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = Date.now();
  const projectsOut = path.join(outputDir, `projects_filtered_${timestamp}.csv`);
  const profilesOut = path.join(outputDir, `profiles_with_projects_${timestamp}.csv`);
  fs.writeFileSync(projectsOut, toCsv(filteredProjects), "utf-8");
  fs.writeFileSync(profilesOut, toCsv(profilesWithProjects), "utf-8");

  const profilesWithAProject = profileProjects.filter((titles) => titles.length > 0).length;
  console.log("---");
  console.log(`Projects matched: ${matchedProjectIdxs.size}/${projectRows.length}`);
  console.log(`Profiles with a project: ${profilesWithAProject}/${profileRows.length}`);
  console.log(`Output: ${projectsOut}`);
  console.log(`Output: ${profilesOut}`);
}

main();
