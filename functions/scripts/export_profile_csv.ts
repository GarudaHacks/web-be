/**
 * Export the PROFILE section of every application to a CSV file, for
 * applicants whose status is at least "submitted" but excluding "rejected"
 * and "canceled" (i.e. submitted, waitlisted, accepted, or confirmed rsvp).
 *
 * PROFILE answers live directly on each `users/{uid}` document (see
 * validateApplicationCompleteness in application_controller.ts). Columns are
 * derived from the `questions` collection (state == PROFILE) so the CSV
 * always matches whatever profile questions are currently configured,
 * ordered by their `order` field.
 *
 * Also adds a `resumeSignedUrl` column: the resume lives at
 * `applications/{uid}.resume` as a public storage URL (see
 * constructDataToSave in application_controller.ts); this script re-signs
 * the underlying object path into a v4 read-only signed URL expiring
 * 2027-01-01, so the link keeps working even if the bucket is later made
 * private.
 *
 * Talks to the PRODUCTION Firestore project + Storage bucket directly via
 * prod-key.json (bypasses .env PROJECT_ID / emulator settings) - this is a
 * read-only export, nothing is written back to Firestore or Storage.
 *
 * To run (from functions/):
 *   npx tsx scripts/export_profile_csv.ts                     # export everyone
 *   npx tsx scripts/export_profile_csv.ts --limit 25           # first 25 only, for a quick check
 *   npx tsx scripts/export_profile_csv.ts --output ./out.csv   # custom output path
 *   npx tsx scripts/export_profile_csv.ts --umn                # only occupationPlace = UMN / Universitas Multimedia Nusantara / etc.
 *
 * --umn matches `occupationPlace` case-insensitively on the acronym "UMN"
 * (also "U.M.N" / "U M N"), or on "Multimedia" followed by "Nusantara" with up
 * to two typos in each word, "Multi Media" split, or "Nusa" abbreviated. Extra
 * text around it ("Universitas", "(UMN)", "/DANA Indonesia") is ignored, while
 * "Bina Nusantara" and other "... Nusantara" names do not match. --limit is
 * applied after this filter.
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as serviceAccount from "../prod-key.json";

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ?? `${serviceAccount.project_id}.firebasestorage.app`;

const app = admin.initializeApp(
  {
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    storageBucket: STORAGE_BUCKET,
  },
  "export-profile-csv"
);
const db = app.firestore();
const bucket = app.storage().bucket();

const PROFILE_STATE = "PROFILE";
const RESUME_LINK_EXPIRY = new Date("2027-01-01T00:00:00Z");

// Application statuses at or past "submitted" (per application_types.ts),
// excluding "rejected" and the portal's "canceled" status (applicationStatus.ts
// in gh-portal - not part of the backend enum, but written as a status value).
const MIN_SUBMITTED_STATUSES = [
  "submitted",
  "waitlisted",
  "accepted",
  "confirmed rsvp",
];

interface ParsedArgs {
  output?: string;
  limit?: number;
  umn: boolean;
}

interface Question {
  id: string; // doc id in `questions`, also the key of the answer on the user doc
  order: number;
}

/**
 * Parse --output, --limit and --umn from argv.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const valueFlags = new Set(["--output", "--limit"]);
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) values[args[i]] = args[++i];
  }
  return {
    output: values["--output"],
    limit: values["--limit"] ? Number(values["--limit"]) : undefined,
    umn: args.includes("--umn"),
  };
}

/**
 * Fetch PROFILE questions, sorted by their `order` field, to use as CSV columns.
 */
async function getProfileColumns(): Promise<Question[]> {
  const snapshot = await db
    .collection("questions")
    .where("state", "==", PROFILE_STATE)
    .get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, order: doc.data().order ?? 0 } as Question))
    .sort((a, b) => a.order - b.order);
}

/**
 * Escape a single CSV field per RFC 4180.
 */
function escapeCsvField(value: unknown): string {
  const str = stringifyValue(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Turn an arbitrary Firestore field value into a flat string for CSV output.
 */
function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stringifyValue).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Extract the bucket-relative object path from a stored resume URL, e.g.
 * `https://storage.googleapis.com/<bucket>/users/uploads/7.0/<uid>_resume.pdf`
 * -> `users/uploads/7.0/<uid>_resume.pdf`. Falls back to treating the whole
 * value as an object path if it isn't a recognized storage URL.
 */
function extractObjectPath(url: string): string {
  const prefix = `https://storage.googleapis.com/${bucket.name}/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  const emulatorMatch = url.match(/^https?:\/\/[^/]+\/[^/]+\/(.+)$/);
  if (emulatorMatch) return emulatorMatch[1];
  return url;
}

/**
 * Generate a v4 read-only signed URL (expiring RESUME_LINK_EXPIRY) for a
 * user's stored resume, or "" if they have no resume on file.
 */
async function getResumeSignedUrl(resumeUrl: unknown): Promise<string> {
  if (typeof resumeUrl !== "string" || !resumeUrl) return "";
  try {
    const objectPath = extractObjectPath(resumeUrl);
    const [signedUrl] = await bucket.file(objectPath).getSignedUrl({
      action: "read",
      expires: RESUME_LINK_EXPIRY,
    });
    return signedUrl;
  } catch (err) {
    console.warn(`  warning: failed to sign resume URL "${resumeUrl}": ${(err as Error).message}`);
    return "";
  }
}

/**
 * Fetch `applications/{uid}` docs for the given uids in chunks (Firestore
 * getAll has no hard limit, but batching keeps individual requests small).
 */
async function getApplicationsByUid(
  uids: string[]
): Promise<Map<string, FirebaseFirestore.DocumentData>> {
  const result = new Map<string, FirebaseFirestore.DocumentData>();
  const chunkSize = 300;
  for (let i = 0; i < uids.length; i += chunkSize) {
    const chunk = uids.slice(i, i + chunkSize);
    const refs = chunk.map((uid) => db.collection("applications").doc(uid));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap) => {
      if (snap.exists) result.set(snap.id, snap.data()!);
    });
  }
  return result;
}

/**
 * True if a free-text occupationPlace refers to Universitas Multimedia
 * Nusantara (UMN), tolerating case, word order, extra text and typos in
 * "Universitas"/"University".
 */
function isUmn(occupationPlace: unknown): boolean {
  if (typeof occupationPlace !== "string") return false;
  const text = occupationPlace.toLowerCase();

  // Acronym, including spaced/dotted forms like "U.M.N" or "U M N".
  if (/\bumn\b/.test(text) || /\bu[\s.]+m[\s.]+n\b/.test(text)) return true;

  // "Multimedia" (or "Multi Media") followed by "Nusantara" (or an
  // abbreviation like "Nusa"), each allowing a couple of typos.
  const words = text.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (const [word, next] of [
      [words[i], i + 1],
      [words[i] + (words[i + 1] ?? ""), i + 2],
    ] as const) {
      if (editDistance(word, "multimedia") > 2) continue;
      const after = [words[next] ?? "", (words[next] ?? "") + (words[next + 1] ?? "")];
      if (after.some(isNusantaraLike)) return true;
    }
  }
  return false;
}

/**
 * True for "nusantara" within two typos, or an abbreviation of it ("nusa").
 */
function isNusantaraLike(word: string): boolean {
  if (word.length >= 3 && "nusantara".startsWith(word)) return true;
  return editDistance(word, "nusantara") <= 2;
}

/**
 * Levenshtein distance between two strings.
 */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Fetch every user doc whose status is at least "submitted", optionally only
 * those studying at UMN.
 */
async function getEligibleUsers(limit?: number, umnOnly = false) {
  const snapshot = await db
    .collection("users")
    .where("status", "in", MIN_SUBMITTED_STATUSES)
    .get();
  const docs = umnOnly
    ? snapshot.docs.filter((doc) => isUmn(doc.data().occupationPlace))
    : snapshot.docs;
  return limit ? docs.slice(0, limit) : docs;
}

/**
 * Entry point: resolve PROFILE columns, fetch eligible users, and write the CSV.
 */
async function main() {
  const { output, limit, umn } = parseArgs();

  console.log("Fetching PROFILE question columns...");
  const columns = await getProfileColumns();
  if (columns.length === 0) {
    console.error(`error: no questions found with state == "${PROFILE_STATE}"`);
    process.exit(1);
  }
  console.log(`Columns: ${columns.map((c) => c.id).join(", ")}`);

  console.log(
    `Fetching users with status in [${MIN_SUBMITTED_STATUSES.join(", ")}]` +
      `${umn ? " and occupationPlace matching UMN" : ""}...`
  );
  const users = await getEligibleUsers(limit, umn);
  console.log(`Found ${users.length} eligible user(s).`);

  console.log("Fetching applications (for resume) and signing resume URLs...");
  const applications = await getApplicationsByUid(users.map((doc) => doc.id));

  const header = ["uid", "status", ...columns.map((c) => c.id), "resumeSignedUrl"];
  const lines = [header.map(escapeCsvField).join(",")];

  for (const [i, doc] of users.entries()) {
    const data = doc.data();
    const resumeUrl = applications.get(doc.id)?.resume;
    const resumeSignedUrl = await getResumeSignedUrl(resumeUrl);
    const row = [
      doc.id,
      data.status ?? "",
      ...columns.map((c) => data[c.id]),
      resumeSignedUrl,
    ];
    lines.push(row.map(escapeCsvField).join(","));
    if ((i + 1) % 50 === 0) console.log(`  signed ${i + 1}/${users.length}`);
  }

  const outputDir = path.resolve(__dirname, ".exports");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = output
    ? path.resolve(output)
    : path.join(outputDir, `profile_export${umn ? "_umn" : ""}_${Date.now()}.csv`);

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");

  console.log("---");
  console.log(`Rows written: ${users.length}`);
  console.log(`Output: ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
