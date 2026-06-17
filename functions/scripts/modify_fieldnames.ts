/**
 * Migration script: rename snake_case field names to camelCase in a collection.
 *
 * To run:
 *   npx tsx scripts/modify_fieldnames.ts
 */

import { db } from "../src/config/firebase"
import { FieldValue } from "firebase-admin/firestore"

// Map of old field name -> new field name
const FIELD_RENAMES: Record<string, string> = {
  date_of_birth: "dateOfBirth",
  first_name: "firstName",
  last_name: "lastName",
  consent_form: "consentForm",
  consent_form_uploaded_at: "consentFormUploadedAt",
  gender_identity: "genderIdentity",
  // Add more renames here, e.g.:
  // first_name: "firstName",
  // last_name: "lastName",
  // created_at: "createdAt",
}

const COLLECTION = "users"

/**
 * Rename fields in a document.
 * @param docId 
 * @param renames 
 * @returns 
 */
async function renameFieldsInDoc(docId: string, renames: Record<string, string>) {
  const ref = db.collection(COLLECTION).doc(docId)
  const snap = await ref.get()

  if (!snap.exists) {
    console.warn(`Document not found: ${docId}`)
    return
  }

  const data = snap.data()
  if (!data) {
    console.warn(`No data for: ${docId}`)
    return
  }
  const updates: Record<string, unknown> = {}
  let hasChanges = false

  for (const [oldField, newField] of Object.entries(renames)) {
    if (Object.prototype.hasOwnProperty.call(data, oldField)) {
      updates[newField] = data[oldField]
      updates[oldField] = FieldValue.delete()
      hasChanges = true
    } else if (Object.prototype.hasOwnProperty.call(data, newField)) {
      // Already migrated — nothing to do
    }
  }

  if (!hasChanges) {
    console.log(`No fields to rename in: ${docId}`)
    return
  }

  await ref.update(updates)
  console.log(`Renamed fields in: ${docId}`)
}

/**
 * Migrate collection to modify fieldNames
 * @param chunkSize 
 */
async function migrateCollection(chunkSize = 400) {
  const allDocs = await db.collection(COLLECTION).get()
  const ids = allDocs.docs.map(d => d.id)
  console.log(`Total documents: ${ids.length}`)

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map(id =>
        renameFieldsInDoc(id, FIELD_RENAMES)
          .catch(err => console.error(`Failed: ${id}`, err))
      )
    )
    console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
  }

  console.log("Migration complete.")
}

; (async () => {
  await migrateCollection()
})()
