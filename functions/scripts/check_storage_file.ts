/**
 * Utility script: check whether a file exists in Firebase Storage,
 * matching by a path prefix and a filename wildcard pattern.
 *
 * Wildcards supported in the filename pattern:
 *   *  - matches any sequence of characters (including none)
 *   ?  - matches exactly one character
 *
 * To run:
 *   npx tsx scripts/check_storage_file.ts <path> <filenamePattern>
 *
 * Examples:
 *   npx tsx scripts/check_storage_file.ts users/uploads/7.0/ "*_resume.pdf"
 *   npx tsx scripts/check_storage_file.ts users/uploads/7.0/ "abc123_*"
 *   npx tsx scripts/check_storage_file.ts users/uploads/7.0/ "abc123_consent.pdf"
 */

import * as admin from "firebase-admin"
import * as path from "path"

const serviceAccount = require(path.resolve(__dirname, "../prod-key.json"))

const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ?? `${serviceAccount.project_id}.firebasestorage.app`

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: STORAGE_BUCKET,
})

function getBucket() {
  return admin.storage().bucket()
}

/**
 * Convert a filename wildcard pattern (*, ?) into an anchored RegExp.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const regexBody = escaped.replace(/\*/g, ".*").replace(/\?/g, ".")
  return new RegExp(`^${regexBody}$`)
}

/**
 * List files under `dirPath` whose filename (last path segment) matches `pattern`.
 * @param dirPath prefix in the bucket, e.g. "users/uploads/7.0/"
 * @param pattern filename wildcard, e.g. "*_resume.pdf"
 */
async function checkFile(dirPath: string, pattern: string) {
  const prefix = dirPath.endsWith("/") || dirPath === "" ? dirPath : `${dirPath}/`
  const bucket = getBucket()

  console.log(`Bucket: ${bucket.name}`)
  console.log(`Prefix: "${prefix}"`)
  console.log(`Pattern: "${pattern}"`)
  console.log("---")

  const [files] = await bucket.getFiles({ prefix })
  const matcher = wildcardToRegExp(pattern)

  const matches = files.filter((file) => {
    const filename = file.name.slice(prefix.length)
    // Only match files directly under the prefix (no nested subdirectories).
    if (filename.includes("/")) return false
    return matcher.test(filename)
  })

  if (matches.length === 0) {
    console.log(`No files match "${pattern}" under "${prefix}" (${files.length} file(s) scanned).`)
    return
  }

  console.log(`Found ${matches.length} matching file(s):`)
  for (const file of matches) {
    const [metadata] = await file.getMetadata()
    const size = metadata.size ? `${metadata.size} bytes` : "unknown size"
    const updated = metadata.updated ?? "unknown"
    console.log(`  ${file.name}  (${size}, updated ${updated})`)
  }
}

;(async () => {
  const [dirPath, pattern] = process.argv.slice(2)

  if (!dirPath || !pattern) {
    console.error("Usage: npx tsx scripts/check_storage_file.ts <path> <filenamePattern>")
    process.exit(1)
  }

  try {
    await checkFile(dirPath, pattern)
  } catch (err) {
    console.error("Error checking storage:", err)
    process.exit(1)
  }
})()
