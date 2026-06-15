/**
 * Migrations script
 * 
 * To run:
 * `npx tsx scripts/migrations.ts `
 */

// import { db } from "../src/config/firebase"
// import { FieldValue } from "firebase-admin/firestore"

// /**
//  * How to use it:
//  * 
//  * `moveToSubcollection("users", "jgxeAa33YZqTYjLQ0qoG", "users/jgxeAa33YZqTYjLQ0qoG/6.0")`
//  * 
//  * @param parentCollection The root collection name
//  * @param docId The docId that lives within the parentCollection
//  * @param subcollectionName The name of the subcollection
//  * @param mergeFields merge fields to existing fields in the subcollection
//  * @param ignoreExists To ignore if data already present
//  */
// async function moveToSubcollection(
//   parentCollection: string,
//   docId: string,
//   subcollectionName: string,
//   fields: string[],
//   mergeFields = true,
//   ignoreExists?: boolean
// ) {
//   const sourceRef = db.collection(parentCollection).doc(docId)
//   const targetRef = db.collection(parentCollection).doc(docId).collection(subcollectionName).doc(docId)

//   const [snapshot, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()])

//   if (!snapshot.exists) {
//     throw new Error(`Document not found: ${docId}`)
//   }
//   if (targetSnap.exists && !ignoreExists) {
//     console.log(`Already migrated: ${docId}, skipping`)
//     return
//   }
//   const data = snapshot.data()!
//   const existingFields = fields.filter(f => f in data)
//   const batch = db.batch()
//   batch.set(targetRef, Object.fromEntries(existingFields.map(f => [f, data[f]])), { merge: mergeFields })
//   if (existingFields.length > 0) {
//     batch.update(sourceRef, Object.fromEntries(existingFields.map(f => [f, FieldValue.delete()])))
//   }
//   await batch.commit()
// }

// /**
//  * Migrate all data.
//  * @param subcollectionName Name of destination subcollection inside the docs
//  * @param chunkSize How many docs processed
//  */
// async function migrateAllUsers(subcollectionName: string, chunkSize = 400) {
//   const fields = [
//     "grade"
//   ]

//   const allDocs = await db.collection("users")
//     .get()
//   const ids = allDocs.docs.map(d => d.id)
//   console.log(`Total documents: ${ids.length}`)

//   for (let i = 0; i < ids.length; i += chunkSize) {
//     const chunk = ids.slice(i, i + chunkSize)
//     await Promise.allSettled(
//       chunk.map(id =>
//         moveToSubcollection("users", id, subcollectionName, fields, true, true)
//           .then(() => console.log(`Migrated: ${id}`))
//           .catch(err => console.error(`Failed: ${id}`, err))
//       )
//     )
//     console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
//   }
//   console.log("Migration complete.")
// }

// /**
//  * Migrate all data mentor.
//  * @param subcollectionName Name of destination subcollection inside the docs
//  * @param chunkSize How many docs processed
//  */
// async function migrateAllMentors(subcollectionName: string, chunkSize = 400) {
//   const fields = [
//     "discordUsername", "firstTimePassword", "intro", "mentor", "specialization"
//   ]

//   const allDocs = await db.collection("users")
//     .where("mentor", "==", true)
//     .get()
//   const ids = allDocs.docs.map(d => d.id)
//   console.log(`Total documents: ${ids.length}`)

//   for (let i = 0; i < ids.length; i += chunkSize) {
//     const chunk = ids.slice(i, i + chunkSize)
//     await Promise.allSettled(
//       chunk.map(id =>
//         moveToSubcollection("users", id, subcollectionName, fields, true, true)
//           .then(() => console.log(`Migrated: ${id}`))
//           .catch(err => console.error(`Failed: ${id}`, err))
//       )
//     )
//     console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
//   }
// }

// /**
//  * Migrate all applications to subcollection.
//  * @param subcollectionName 
//  * @param chunkSize 
//  */
// async function migrateAllApplications(subcollectionName: string, chunkSize = 400) {
//   const fields = [
//     "accommodations", "bigProblem", "blood_type", "code_of_conduct", "desiredRoles", "dietary_restrictions", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship", "evaluationNotes", "garudaHacksAttendance", "hackathonCount", "interestingProject", "liability_waiver", "list_teammates", "lookingForTeammates", "medical_consent", "medical_info", "motivation", "referralSource", "resume", "score", "createdAt", "updatedAt", "referral_code"
//   ]

//   const allDocs = await db.collection("applications")
//     // .where()
//     .get()
//   const ids = allDocs.docs.map(d => d.id)
//   console.log(`Total documents: ${ids.length}`)

//   for (let i = 0; i < ids.length; i += chunkSize) {
//     const chunk = ids.slice(i, i + chunkSize)
//     await Promise.allSettled(
//       chunk.map(id =>
//         moveToSubcollection("applications", id, subcollectionName, fields, false, true)
//           .then(() => console.log(`Migrated: ${id}`))
//           .catch(err => console.error(`Failed: ${id}`, err))
//       )
//     )
//     console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
//   }
// }

// /**
//  * Clean up the null fields present in the specified collection name, and its subcollection.
//  * @param parentCollection 
//  * @param subcollectionName 
//  * @param chunkSize 
//  */
// async function cleanUpNullFields(parentCollection: string, subcollectionName: string, chunkSize = 400) {
//   const allDocs = await db.collection(parentCollection).get()
//   const ids = allDocs.docs.map(d => d.id)
//   console.log(`Total documents: ${ids.length}`)

//   let cleaned = 0
//   let skipped = 0

//   for (let i = 0; i < ids.length; i += chunkSize) {
//     const chunk = ids.slice(i, i + chunkSize)
//     await Promise.allSettled(
//       chunk.map(async id => {
//         const ref = db.collection(parentCollection).doc(id).collection(subcollectionName).doc(id)
//         const snap = await ref.get()
//         if (!snap.exists) {
//           skipped++
//           return
//         }
//         const data = snap.data()!
//         const nullFields = Object.keys(data).filter(k => data[k] === null)
//         if (nullFields.length === 0) {
//           skipped++
//           return
//         }
//         await ref.update(Object.fromEntries(nullFields.map(f => [f, FieldValue.delete()])))
//         console.log(`Cleaned ${nullFields.length} null field(s) from ${id}: ${nullFields.join(", ")}`)
//         cleaned++
//       })
//     )
//     console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
//   }
//   console.log(`Clean up complete. Cleaned: ${cleaned}, Skipped: ${skipped}`)
// }

// async function deleteFieldsFromCollection(collection: string, fields: string[], chunkSize = 400) {
//     const allDocs = await db.collection(collection).get()
//     const ids = allDocs.docs.map(d => d.id)
//     console.log(`Total documents: ${ids.length}`)

//     const deleteMap = Object.fromEntries(fields.map(f => [f, FieldValue.delete()]))

//     for (let i = 0; i < ids.length; i += chunkSize) {
//         const chunk = ids.slice(i, i + chunkSize)
//         const batch = db.batch()
//         chunk.forEach(id => {
//             batch.update(db.collection(collection).doc(id), deleteMap)
//         })
//         await batch.commit()
//         console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
//     }
// }

; (async () => {
  // await migrateAllUsers("6.0")
  // await migrateAllMentors("6.0")
  // await migrateAllApplications("6.0")
  // await cleanUpNullFields("users", "6.0")
  // await deleteFieldsFromCollection("users", [
  //     "userId", "accommodations", "bigProblem", "blood_type", "code_of_conduct", "desiredRoles", "dietary_restrictions", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship", "evaluationNotes", "garudaHacksAttendance", "hackathonCount", "interestingProject", "liability_waiver", "list_teammates", "lookingForTeammates", "medical_consent", "medical_info", "motivation", "referralSource", "resume", "score",
  // ])
})()

