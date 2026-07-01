/**
 * Migration script: make every uploaded file under a storage prefix PRIVATE,
 * removing the public-read ACL that the app grants via makePublic().
 *
 * After this runs, the plain https://storage.googleapis.com/<bucket>/<path>
 * URLs stored in Firestore stop working anonymously. Files must instead be
 * opened through a short-lived signed URL (see gh-admin /api/file-url).
 *
 * Dry-run by default — prints what it WOULD change and touches nothing.
 * Pass --apply to actually make the objects private.
 *
 * To run:
 *   npx tsx scripts/migrate_uploads_private.ts            # dry-run
 *   npx tsx scripts/migrate_uploads_private.ts --apply    # execute
 *   npx tsx scripts/migrate_uploads_private.ts --apply --prefix users/uploads/7.0/
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

const DEFAULT_PREFIX = "users/uploads/7.0/"

function parseArgs() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const prefixIdx = args.indexOf("--prefix")
  const prefix = prefixIdx >= 0 && args[prefixIdx + 1] ? args[prefixIdx + 1] : DEFAULT_PREFIX
  return { apply, prefix }
}

/**
 * True if the object's ACL grants read to allUsers (i.e. it is public).
 */
function isPublic(aclEntries: Array<{ entity?: string; role?: string }> | null): boolean {
  if (!aclEntries) return false
  return aclEntries.some((e) => e.entity === "allUsers")
}

async function migrate() {
  const { apply, prefix } = parseArgs()
  const bucket = admin.storage().bucket()

  console.log(`Bucket:  ${bucket.name}`)
  console.log(`Prefix:  ${prefix}`)
  console.log(`Mode:    ${apply ? "APPLY (making files private)" : "DRY-RUN (no changes)"}`)
  console.log("---")

  const [files] = await bucket.getFiles({ prefix })
  console.log(`Found ${files.length} object(s) under prefix.`)

  let publicCount = 0
  let madePrivate = 0
  let alreadyPrivate = 0
  let failed = 0

  for (const file of files) {
    let wasPublic = false
    try {
      const [acl] = await file.acl.get()
      wasPublic = isPublic(acl as Array<{ entity?: string; role?: string }>)
    } catch (err) {
      console.warn(`  ! could not read ACL for ${file.name}:`, (err as Error).message)
    }

    if (!wasPublic) {
      alreadyPrivate++
      continue
    }

    publicCount++
    if (!apply) {
      console.log(`  [would make private] ${file.name}`)
      continue
    }

    try {
      // Removes allUsers/allAuthenticatedUsers read; project members keep access.
      await file.makePrivate()
      madePrivate++
      console.log(`  [private] ${file.name}`)
    } catch (err) {
      failed++
      console.error(`  ! failed to make private ${file.name}:`, (err as Error).message)
    }
  }

  console.log("---")
  console.log(`Public before:   ${publicCount}`)
  console.log(`Already private: ${alreadyPrivate}`)
  if (apply) {
    console.log(`Made private:    ${madePrivate}`)
    console.log(`Failed:          ${failed}`)
    console.log("Done. Public storage.googleapis.com links will no longer work anonymously.")
  } else {
    console.log("Dry-run complete. Re-run with --apply to make these files private.")
  }
}

migrate().catch((err) => {
  console.error("Migration error:", err)
  process.exit(1)
})
