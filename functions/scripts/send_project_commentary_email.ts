/**
 * Email each Garuda Hacks 7.0 submitter their judging-feedback PDF, using the
 * projectCommentary.html template with the export attached.
 *
 * Recipients come from pairing the PDFs in scripts/.exports/ with the
 * submissions CSV: every export is named "<project-slug>-<email-slug>.pdf"
 * (e.g. "agree-celinesesetiawan5-gmail-com.pdf"), so each CSV email is
 * slugified the same way and matched against the tail of the filename. A
 * submitter with more than one exported project gets one email carrying all
 * of their PDFs.
 *
 * Nothing is ever sent to an address with no export: the run is driven by the
 * contents of .exports/, and each attachment is re-checked on disk immediately
 * before the message goes out.
 *
 * Sends through the AWS SES SMTP relay configured in .env, pooled and
 * rate-limited so the attachment-heavy batch doesn't trip SES's max sending
 * rate. Throttled/transient sends are retried with backoff instead of dropped.
 *
 * Each successful send is recorded in scripts/logs/project_commentary_sent.json
 * as {email, sentAt} and the file is rewritten immediately, so an interrupted
 * run resumes exactly where it stopped. Later runs skip anyone already in
 * there, making it safe to re-run for stragglers without double-emailing.
 * No Firestore access needed - the submission emails are the source of truth,
 * and ~19 of them have no portal account to key off anyway.
 *
 * Dry-run by default - only lists what would go out, sends nothing.
 *
 * To run (from functions/):
 *   npx tsx scripts/send_project_commentary_email.ts                                  # dry-run, full manifest
 *   npx tsx scripts/send_project_commentary_email.ts --test-email you@x.com --send    # one random export to you
 *   npx tsx scripts/send_project_commentary_email.ts --test-email you@x.com --pdf agree-celinesesetiawan5-gmail-com.pdf --send
 *   npx tsx scripts/send_project_commentary_email.ts --send                           # send to everyone not yet sent
 *   npx tsx scripts/send_project_commentary_email.ts --send --limit 25                # first 25 only
 *   npx tsx scripts/send_project_commentary_email.ts --send --force                   # ignore the sent-log and resend
 *
 * Flags:
 *   --send                actually deliver (otherwise dry-run)
 *   --test-email <addr>   send to this address only, using one export as a sample
 *   --pdf <filename>      with --test-email, pick this export instead of a random one
 *   --limit <n>           cap the number of recipients
 *   --force               resend even to addresses already marked as sent
 *   --csv <path>          override the submissions CSV path
 *   --exports <path>      override the exports directory
 *
 * Env overrides:
 *   SES_SEND_RATE        max messages/sec through the SES relay (default 5)
 *   SES_MAX_CONNECTIONS  pooled SMTP connections (default 3)
 *   SES_MAX_RETRIES      retries per message on throttling/transient errors (default 5)
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUBJECT = "Your Garuda Hacks 7.0 Judging Feedback";

const DEFAULT_EXPORTS_DIR = path.resolve(__dirname, ".exports");
const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "../../../JUDGING/Garuda Hacks 7.0 Submissons - NAME-EMAIL.csv"
);
const TEMPLATE_PATH = path.resolve(__dirname, "../src/templates/projectCommentary.html");
const SENT_LOG_PATH = path.resolve(__dirname, "logs/project_commentary_sent.json");

const RATE_LIMIT = Number(process.env.SES_SEND_RATE ?? 5);
const MAX_CONNECTIONS = Number(process.env.SES_MAX_CONNECTIONS ?? 3);
const MAX_RETRIES = Number(process.env.SES_MAX_RETRIES ?? 5);

const transporter = nodemailer.createTransport({
  host: process.env.SES_SMTP_HOST,
  port: Number(process.env.SES_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SES_SMTP_USERNAME,
    pass: process.env.SES_SMTP_PASSWORD,
  },
  pool: true,
  maxConnections: MAX_CONNECTIONS,
  rateDelta: 1000,
  rateLimit: RATE_LIMIT,
});

interface ParsedArgs {
  send: boolean;
  testEmail?: string;
  pdf?: string;
  limit?: number;
  force: boolean;
  csvPath: string;
  exportsDir: string;
}

interface Submission {
  projectTitle: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Attachment {
  filename: string; // what the recipient sees
  sourcePath: string; // absolute path in .exports
  projectTitle: string;
}

interface Recipient {
  email: string;
  firstName: string;
  attachments: Attachment[];
}

interface SentEntry {
  email: string;
  sentAt: string; // ISO 8601
}

/**
 * Parse the supported flags out of argv.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  /**
   * Read the value that follows `flag`, or undefined if the flag is absent.
   */
  const valueOf = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const limit = valueOf("--limit");
  return {
    send: args.includes("--send"),
    testEmail: valueOf("--test-email"),
    pdf: valueOf("--pdf"),
    limit: limit ? Number(limit) : undefined,
    force: args.includes("--force"),
    csvPath: valueOf("--csv") ?? DEFAULT_CSV_PATH,
    exportsDir: valueOf("--exports") ?? DEFAULT_EXPORTS_DIR,
  };
}

/**
 * Parse CSV text into rows of fields, honouring double-quoted fields that
 * contain commas, newlines or escaped ("") quotes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * Read the submissions CSV into Submission records, skipping the header row.
 */
function readSubmissions(csvPath: string): Submission[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Submissions CSV not found at ${csvPath} (pass --csv <path>)`);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  return rows.slice(1).map((cols) => ({
    projectTitle: (cols[0] ?? "").trim(),
    status: (cols[1] ?? "").trim(),
    firstName: (cols[2] ?? "").trim(),
    lastName: (cols[3] ?? "").trim(),
    email: (cols[4] ?? "").trim().toLowerCase(),
  }));
}

/**
 * Lowercase and collapse everything that isn't a letter or digit into single
 * dashes - the same shape the export filenames use for emails and titles.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Human-friendly attachment name, e.g. "Garuda Hacks 7.0 Judging Feedback - AGREE.pdf".
 */
function attachmentName(projectTitle: string): string {
  const safeTitle = projectTitle.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `Garuda Hacks 7.0 Judging Feedback - ${safeTitle || "Project"}.pdf`;
}

/**
 * Pair every export PDF with the CSV row whose email slug matches the tail of
 * the filename, then group the results into one Recipient per email address.
 * Unmatched PDFs are reported and skipped rather than guessed at.
 */
function buildRecipients(exportsDir: string, submissions: Submission[]): {
  recipients: Recipient[];
  unmatched: string[];
} {
  if (!fs.existsSync(exportsDir)) {
    throw new Error(`Exports directory not found at ${exportsDir} (pass --exports <path>)`);
  }
  const files = fs
    .readdirSync(exportsDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  // Longest slug first so a short email can never shadow a longer one that
  // happens to end with the same characters.
  const bySlug = submissions
    .filter((s) => s.email)
    .map((s) => ({ slug: slugify(s.email), submission: s }))
    .sort((a, b) => b.slug.length - a.slug.length);

  const byEmail = new Map<string, Recipient>();
  const unmatched: string[] = [];

  for (const file of files) {
    const base = file.replace(/\.pdf$/i, "");
    const hit = bySlug.find(({ slug }) => base === slug || base.endsWith(`-${slug}`));
    if (!hit) {
      unmatched.push(file);
      continue;
    }
    const { submission } = hit;
    // The filename's leading segment is the project slug; prefer the CSV title
    // whose slug prefixes it, so submitters with two projects get the right names.
    const titleFromCsv = submissions
      .filter((s) => s.email === submission.email && s.projectTitle)
      .find((s) => base.startsWith(slugify(s.projectTitle)));
    const projectTitle = titleFromCsv?.projectTitle ?? submission.projectTitle;

    let recipient = byEmail.get(submission.email);
    if (!recipient) {
      recipient = { email: submission.email, firstName: submission.firstName, attachments: [] };
      byEmail.set(submission.email, recipient);
    }
    recipient.attachments.push({
      filename: attachmentName(projectTitle),
      sourcePath: path.join(exportsDir, file),
      projectTitle,
    });
  }

  return { recipients: [...byEmail.values()], unmatched };
}

/**
 * Drop anything that would go out without a real PDF behind it: attachments
 * whose file has vanished or is empty, and then recipients left with none.
 * This is the last gate before sending.
 */
function withPresentExports(recipients: Recipient[]): Recipient[] {
  const kept: Recipient[] = [];
  for (const recipient of recipients) {
    const attachments = recipient.attachments.filter((a) => {
      const exists = fs.existsSync(a.sourcePath) && fs.statSync(a.sourcePath).size > 0;
      if (!exists) {
        console.warn(`  ! missing/empty export for ${recipient.email}: ${a.sourcePath}`);
      }
      return exists;
    });
    if (attachments.length === 0) {
      console.warn(`Skipping ${recipient.email} - no export present.`);
      continue;
    }
    kept.push({ ...recipient, attachments });
  }
  return kept;
}

/**
 * Fill the optional {{firstName}} / {{projectTitle}} / {{projectList}} tokens.
 * The template works fine without them; this only rewrites what is present.
 */
function renderTemplate(template: string, recipient: Recipient): string {
  const titles = recipient.attachments.map((a) => a.projectTitle);
  return template
    .replace(/\{\{\s*firstName\s*\}\}/g, recipient.firstName || "there")
    .replace(/\{\{\s*projectTitle\s*\}\}/g, titles[0] ?? "")
    .replace(/\{\{\s*projectList\s*\}\}/g, titles.join(", "));
}

/**
 * Read previous runs' deliveries, keyed by email. Tolerates the plain array of
 * addresses an earlier version of this script wrote.
 */
function readSentLog(): Map<string, SentEntry> {
  const log = new Map<string, SentEntry>();
  if (!fs.existsSync(SENT_LOG_PATH)) return log;
  try {
    const parsed = JSON.parse(fs.readFileSync(SENT_LOG_PATH, "utf-8"));
    const entries: unknown[] = Array.isArray(parsed) ? parsed : parsed.sent ?? [];
    for (const entry of entries) {
      if (typeof entry === "string") {
        log.set(entry, { email: entry, sentAt: "" });
      } else if (entry && typeof (entry as SentEntry).email === "string") {
        const e = entry as SentEntry;
        log.set(e.email, e);
      }
    }
  } catch (err) {
    // Refuse to continue rather than silently treating a corrupt log as empty,
    // which would re-send to everyone.
    throw new Error(`Could not read sent-log at ${SENT_LOG_PATH}: ${(err as Error).message}`);
  }
  return log;
}

/**
 * Persist the sent-log so an interrupted run can be resumed without resending.
 * Written via a temp file + rename so a crash mid-write can't truncate it.
 */
function writeSentLog(log: Map<string, SentEntry>): void {
  fs.mkdirSync(path.dirname(SENT_LOG_PATH), { recursive: true });
  const sorted = [...log.values()].sort((a, b) => a.email.localeCompare(b.email));
  const tmpPath = `${SENT_LOG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(sorted, null, 2));
  fs.renameSync(tmpPath, SENT_LOG_PATH);
}

/**
 * Resolve after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True if the error looks like SES throttling or a transient network failure.
 */
function isRetryable(err: any): boolean {
  const msg = String(err?.response ?? err?.message ?? err);
  return (
    err?.responseCode === 454 ||
    /throttl/i.test(msg) ||
    /rate exceeded/i.test(msg) ||
    ["ETIMEDOUT", "ECONNRESET", "ESOCKET", "EAI_AGAIN"].includes(err?.code)
  );
}

/**
 * Send one email with its PDF attachments, retrying with exponential backoff
 * on throttling/transient errors.
 */
async function sendWithRetry(to: string, html: string, attachments: Attachment[]): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject: SUBJECT,
        html,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          path: a.sourcePath,
          contentType: "application/pdf",
        })),
      });
      return;
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isRetryable(err)) {
        throw err;
      }
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `  retrying ${to} after error (attempt ${attempt + 1}/${MAX_RETRIES}): ${(err as Error).message}. waiting ${backoff}ms`
      );
      await sleep(backoff);
    }
  }
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight at once.
 */
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  /**
   * Pull the next item off the shared queue and process it.
   */
  async function next(): Promise<void> {
    const current = idx++;
    if (current >= items.length) return;
    await worker(items[current]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

/**
 * Build the single fake recipient used by --test-email: the requested export,
 * or a random one, addressed to whoever asked for the test.
 */
function buildTestRecipient(all: Recipient[], testEmail: string, pdf?: string): Recipient {
  const everyAttachment = all.flatMap((r) => r.attachments);
  if (everyAttachment.length === 0) {
    throw new Error("No exports available to sample for a test send.");
  }
  let sample: Attachment | undefined;
  if (pdf) {
    const wanted = path.basename(pdf).toLowerCase();
    sample = everyAttachment.find((a) => path.basename(a.sourcePath).toLowerCase() === wanted);
    if (!sample) throw new Error(`No export named "${pdf}" in the exports directory.`);
  } else {
    sample = everyAttachment[Math.floor(Math.random() * everyAttachment.length)];
  }
  const owner = all.find((r) => r.attachments.includes(sample as Attachment));
  console.log(`Test sample: ${path.basename(sample.sourcePath)} (real owner: ${owner?.email ?? "unknown"})`);
  return { email: testEmail.trim().toLowerCase(), firstName: owner?.firstName ?? "there", attachments: [sample] };
}

/**
 * Entry point: pair exports with the CSV, then dry-run or deliver.
 */
async function main() {
  const { send, testEmail, pdf, limit, force, csvPath, exportsDir } = parseArgs();

  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const submissions = readSubmissions(csvPath);
  const { recipients: allRecipients, unmatched } = buildRecipients(exportsDir, submissions);

  const totalExports = allRecipients.reduce((n, r) => n + r.attachments.length, 0);
  console.log(`Exports dir: ${exportsDir}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Matched ${totalExports} export(s) to ${allRecipients.length} recipient(s).`);
  if (unmatched.length > 0) {
    console.warn(`WARNING - ${unmatched.length} export(s) had no matching email in the CSV and will be skipped:`);
    unmatched.forEach((f) => console.warn(`  ${f}`));
  }

  let recipients: Recipient[];
  if (testEmail) {
    recipients = [buildTestRecipient(allRecipients, testEmail, pdf)];
  } else {
    const alreadySent = force ? new Map<string, SentEntry>() : readSentLog();
    recipients = allRecipients.filter((r) => !alreadySent.has(r.email));
    const skipped = allRecipients.length - recipients.length;
    if (skipped > 0) {
      console.log(`Skipping ${skipped} address(es) already in the sent-log (pass --force to resend).`);
    }
    if (limit) recipients = recipients.slice(0, limit);
  }

  recipients = withPresentExports(recipients);

  console.log(`Subject: ${SUBJECT}`);
  console.log(`Recipients this run: ${recipients.length}`);

  if (!send) {
    const logDir = path.resolve(__dirname, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const manifestPath = path.join(logDir, "project_commentary_manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          unmatched,
          recipients: recipients.map((r) => ({
            email: r.email,
            firstName: r.firstName,
            attachments: r.attachments.map((a) => ({ source: path.basename(a.sourcePath), attachedAs: a.filename })),
          })),
        },
        null,
        2
      )
    );

    console.log("DRY RUN - pass --send to actually deliver. Sample:");
    recipients.slice(0, 20).forEach((r) => {
      const files = r.attachments.map((a) => `${path.basename(a.sourcePath)} as "${a.filename}"`).join(", ");
      console.log(`  ${r.email} <- ${files}`);
    });
    if (recipients.length > 20) console.log(`  ...and ${recipients.length - 20} more`);
    console.log(`Full manifest written to ${manifestPath}`);
    return;
  }

  const sentLog = readSentLog();
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  await runPool(recipients, MAX_CONNECTIONS, async (recipient) => {
    try {
      await sendWithRetry(recipient.email, renderTemplate(template, recipient), recipient.attachments);
      sent.push(recipient.email);
      if (!testEmail) {
        sentLog.set(recipient.email, { email: recipient.email, sentAt: new Date().toISOString() });
        writeSentLog(sentLog);
      }
      console.log(
        `[${sent.length + failed.length}/${recipients.length}] sent -> ${recipient.email} (${recipient.attachments.length} pdf)`
      );
    } catch (err) {
      failed.push({ email: recipient.email, error: (err as Error).message });
      console.error(
        `[${sent.length + failed.length}/${recipients.length}] FAILED -> ${recipient.email}: ${(err as Error).message}`
      );
    }
  });

  transporter.close();

  const logDir = path.resolve(__dirname, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `project_commentary_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ sent, failed, unmatched }, null, 2));

  console.log("---");
  console.log(`Sent: ${sent.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Log written to ${logPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
