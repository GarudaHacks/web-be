/**
 * Migration script: Convert ISO string dates to Firebase Timestamps.
 *
 * To run:
 * `npx tsx scripts/migrate_timestamps.ts`
 */

import * as admin from "firebase-admin"
import { Timestamp } from "firebase-admin/firestore"
import * as path from "path"

const serviceAccount = require(path.resolve(__dirname, "../prod-key.json"))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

const USER_DATE_FIELDS = ["createdAt", "updatedAt", "submittedAt", "acceptedAt", "rejectedAt", "confirmedRsvpAt"]
const APPLICATION_DATE_FIELDS = ["createdAt"]

function toTimestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return null
  if (typeof value !== "string") return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  return Timestamp.fromDate(date)
}

async function migrateCollection(
  collectionName: string,
  dateFields: string[],
  chunkSize = 400
) {
  const allDocs = await db.collection(collectionName).get()
  console.log(`[${collectionName}] Total documents: ${allDocs.size}`)

  let converted = 0
  let skipped = 0

  const docs = allDocs.docs
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize)
    const batch = db.batch()
    let batchUpdates = 0

    for (const doc of chunk) {
      const data = doc.data()
      const updates: Record<string, Timestamp> = {}

      for (const field of dateFields) {
        if (!(field in data)) continue
        const ts = toTimestamp(data[field])
        if (ts) updates[field] = ts
      }

      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates)
        batchUpdates++
        converted++
        console.log(`  Converting ${doc.id}: ${Object.keys(updates).join(", ")}`)
      } else {
        skipped++
      }
    }

    if (batchUpdates > 0) await batch.commit()
    console.log(`  Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${docs.length})`)
  }

  console.log(`[${collectionName}] Complete. Converted: ${converted}, Skipped: ${skipped}`)
}

;(async () => {
  await migrateCollection("users", USER_DATE_FIELDS)
  await migrateCollection("applications", APPLICATION_DATE_FIELDS)
  console.log("All migrations complete.")
})()
