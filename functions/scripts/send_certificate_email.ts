/**
 * Send per-recipient certificate PDFs for a CERTIFICATES folder (PARTICIPANTS,
 * MENTORS, JUDGES-*, WORKSHOP-*, VOLUNTEERS, ...).
 *
 * Given a folder, this reads:
 *   <folder>/emailTemplate.html      the email body (REQUIRED - aborts if missing)
 *   <folder>/<FOLDER>_DATA.csv       recipients (header row, must include `email`)
 *   <folder>/export/<email>.pdf      one certificate PDF per recipient, named after
 *                                    the sanitized CSV email (script.py convention)
 *
 * The subject is taken from --subject, else the template's <title>, else its <h1>.
 * `{column}` placeholders in the template (e.g. {name}) are filled per recipient.
 *
 * Sends through the AWS SES SMTP relay configured in .env, pooled and
 * rate-limited; throttled/transient sends are retried with backoff.
 *
 * Each successful send is recorded in <folder>/.sent.json; subsequent runs skip
 * anyone already listed there, so re-running for stragglers is safe.
 *
 * Dry-run by default - only counts/lists recipients, sends nothing.
 *
 * To run (from functions/):
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS                  # dry-run
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS --send \
 *       --test-email you@x.com [--test-pdf someone@gmail.com]               # smoke test w/ any pdf
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS --send           # send to everyone not yet sent
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS --send --limit 25
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS --send --force   # ignore .sent.json
 *   npx tsx scripts/send_certificate_email.ts PARTICIPANTS --send --skip-missing  # skip rows w/o pdf
 *
 * The folder may be an absolute/relative path, or a bare name resolved against
 * CERT_ROOT (default: /Users/someuser/Documents/GarudaHacks/CERTIFICATES).
 *
 * Env overrides:
 *   CERT_ROOT            base dir bare folder names resolve against
 *   SES_SEND_RATE        max messages/sec through the SES relay (default 10)
 *   SES_MAX_CONNECTIONS  pooled SMTP connections (default 5)
 *   SES_MAX_RETRIES      retries per message on throttling/transient errors (default 5)
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const CERT_ROOT = process.env.CERT_ROOT ?? "../../CERTIFICATES";

const RATE_LIMIT = Number(process.env.SES_SEND_RATE ?? 10);
const MAX_CONNECTIONS = Number(process.env.SES_MAX_CONNECTIONS ?? 5);
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
  folder: string;
  send: boolean;
  testEmail?: string;
  testPdf?: string;
  subject?: string;
  limit?: number;
  force: boolean;
  skipMissing: boolean;
}

interface Recipient {
  email: string; // lowercased, used as the To: address and .sent.json key
  pdfPath: string;
  row: Record<string, string>; // raw CSV row for {placeholder} filling
}

/**
 * Parse the positional folder plus --send, --test-email, --test-pdf,
 * --subject, --limit, --force and --skip-missing from argv.
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const valueFlags = new Set(["--test-email", "--test-pdf", "--subject", "--limit"]);
  const values: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) {
      values[args[i]] = args[++i];
    } else if (!args[i].startsWith("--")) {
      positionals.push(args[i]);
    }
  }
  if (positionals.length !== 1) {
    console.error("usage: npx tsx scripts/send_certificate_email.ts <folder> [--send] [--test-email addr [--test-pdf name]] [--subject s] [--limit n] [--force] [--skip-missing]");
    process.exit(1);
  }
  return {
    folder: positionals[0],
    send: args.includes("--send"),
    testEmail: values["--test-email"],
    testPdf: values["--test-pdf"],
    subject: values["--subject"],
    limit: values["--limit"] ? Number(values["--limit"]) : undefined,
    force: args.includes("--force"),
    skipMissing: args.includes("--skip-missing"),
  };
}

/**
 * Resolve the folder argument: as-is / relative to cwd first, then as a bare
 * name under CERT_ROOT.
 */
function resolveFolder(input: string): string {
  for (const candidate of [path.resolve(input), path.join(CERT_ROOT, input)]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  console.error(`error: folder not found: ${input} (also tried under ${CERT_ROOT})`);
  process.exit(1);
}

/**
 * Make a CSV value safe to use as a filename - mirrors sanitize_filename in
 * script.py so recipient emails map to the exact PDF names it produced.
 */
function sanitizeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") || "unnamed";
}

/**
 * Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines).
 * Returns one Record per row keyed by the header row.
 */
function parseCsv(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  const header = (rows.shift() ?? []).map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/**
 * Escape a CSV value for interpolation into the HTML template.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fill {column} placeholders in the template with this recipient's CSV values.
 */
function fillTemplate(template: string, row: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(row)) {
    html = html.split(`{${key}}`).join(escapeHtml(value));
  }
  return html;
}

/**
 * Derive the subject: --subject flag, else the template's <title>, else its <h1>.
 */
function deriveSubject(template: string, override?: string): string {
  if (override) return override;
  for (const re of [/<title>([\s\S]*?)<\/title>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]) {
    const m = template.match(re);
    if (m) {
      const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }
  console.error("error: could not derive a subject from the template (<title> or <h1>) - pass --subject");
  process.exit(1);
}

/**
 * Locate the folder's data CSV: <FOLDER>_DATA.csv, else the single *_DATA.csv.
 */
function findDataCsv(folder: string): string {
  const preferred = path.join(folder, `${path.basename(folder)}_DATA.csv`);
  if (fs.existsSync(preferred)) return preferred;
  const matches = fs.readdirSync(folder).filter((f) => f.endsWith("_DATA.csv"));
  if (matches.length !== 1) {
    console.error(`error: expected exactly one *_DATA.csv in ${folder}, found ${matches.length}`);
    process.exit(1);
  }
  return path.join(folder, matches[0]);
}

/**
 * Build deduped recipients from the CSV, resolving each row's PDF in export/
 * and skipping anyone already in .sent.json unless `force` is set.
 */
function getRecipients(folder: string, sentLog: Record<string, string>, force: boolean, skipMissing: boolean): Recipient[] {
  const csvPath = findDataCsv(folder);
  const exportDir = path.join(folder, "export");
  const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  const missing: string[] = [];
  let alreadySent = 0;

  for (const row of rows) {
    const email = row.email;
    if (typeof email !== "string" || !email.trim()) continue;
    const normalized = email.trim().toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (!force && sentLog[normalized]) {
      alreadySent++;
      continue;
    }
    const pdfPath = path.join(exportDir, `${sanitizeFilename(email)}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      missing.push(email.trim());
      continue;
    }
    recipients.push({ email: normalized, pdfPath, row });
  }

  if (alreadySent > 0) {
    console.log(`Skipping ${alreadySent} recipient(s) already in .sent.json (pass --force to resend).`);
  }
  if (missing.length > 0) {
    console.warn(`WARNING: no PDF in export/ for ${missing.length} recipient(s):`);
    missing.forEach((e) => console.warn(`  ${e}`));
    if (!skipMissing) {
      console.error("error: aborting - regenerate the missing PDFs or pass --skip-missing to send without them");
      process.exit(1);
    }
  }
  return recipients;
}

/**
 * Resolve the --test-pdf value (email, filename, or path) to a PDF in export/;
 * defaults to the first PDF there.
 */
function resolveTestPdf(folder: string, testPdf?: string): string {
  const exportDir = path.join(folder, "export");
  if (testPdf) {
    const candidates = [
      path.resolve(testPdf),
      path.join(exportDir, testPdf),
      path.join(exportDir, `${sanitizeFilename(testPdf)}.pdf`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    console.error(`error: test PDF not found: ${testPdf} (tried as path, as export/ filename, and as email)`);
    process.exit(1);
  }
  const first = fs.readdirSync(exportDir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()[0];
  if (!first) {
    console.error(`error: no PDFs in ${exportDir}`);
    process.exit(1);
  }
  return path.join(exportDir, first);
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
 * Send one email with the certificate attached, retrying with exponential
 * backoff on throttling/transient errors.
 */
async function sendWithRetry(to: string, subject: string, html: string, pdfPath: string, attachmentName: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await transporter.sendMail({
        from: process.env.SES_FROM_EMAIL,
        to,
        subject,
        html,
        attachments: [{ filename: attachmentName, path: pdfPath, contentType: "application/pdf" }],
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
 * Entry point: validate the folder, resolve recipients, dry-run or send, and
 * write a results log.
 */
async function main() {
  const { folder, send, testEmail, testPdf, subject: subjectOverride, limit, force, skipMissing } = parseArgs();

  const folderPath = resolveFolder(folder);
  const templatePath = path.join(folderPath, "emailTemplate.html");
  if (!fs.existsSync(templatePath)) {
    console.error(`error: ${templatePath} not found - every folder needs its own emailTemplate.html. Stopping.`);
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, "utf-8");
  const subject = deriveSubject(template, subjectOverride);

  const sentLogPath = path.join(folderPath, ".sent.json");
  const sentLog: Record<string, string> = fs.existsSync(sentLogPath)
    ? JSON.parse(fs.readFileSync(sentLogPath, "utf-8"))
    : {};

  let recipients: Recipient[];
  if (testEmail) {
    const pdfPath = resolveTestPdf(folderPath, testPdf);
    recipients = [{ email: testEmail, pdfPath, row: { name: "Test User", email: testEmail } }];
    console.log(`TEST MODE: ${testEmail} <- ${path.basename(pdfPath)}`);
  } else {
    recipients = getRecipients(folderPath, sentLog, force, skipMissing);
  }
  if (limit) recipients = recipients.slice(0, limit);

  console.log(`Folder: ${folderPath}`);
  console.log(`Subject: ${subject}`);
  console.log(`Recipients: ${recipients.length}`);

  if (!send) {
    console.log("DRY RUN - pass --send to actually deliver. Sample recipients:");
    recipients.slice(0, 20).forEach((r) => console.log(`  ${r.email}  <- ${path.basename(r.pdfPath)}`));
    if (recipients.length > 20) console.log(`  ...and ${recipients.length - 20} more`);
    return;
  }

  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  await runPool(recipients, MAX_CONNECTIONS, async ({ email, pdfPath, row }) => {
    try {
      const html = fillTemplate(template, row);
      const attachmentName = row.name
        ? `Garuda Hacks 7.0 Certificate - ${sanitizeFilename(row.name)}.pdf`
        : "Garuda Hacks 7.0 Certificate.pdf";
      await sendWithRetry(email, subject, html, pdfPath, attachmentName);
      sent.push(email);
      console.log(`[${sent.length + failed.length}/${recipients.length}] sent -> ${email}`);
      if (!testEmail) {
        sentLog[email] = new Date().toISOString();
        fs.writeFileSync(sentLogPath, JSON.stringify(sentLog, null, 2));
      }
    } catch (err) {
      failed.push({ email, error: (err as Error).message });
      console.error(`[${sent.length + failed.length}/${recipients.length}] FAILED -> ${email}: ${(err as Error).message}`);
    }
  });

  transporter.close();

  const logDir = path.resolve(__dirname, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `certificates_${path.basename(folderPath)}_${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ folder: folderPath, subject, sent, failed }, null, 2));

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
