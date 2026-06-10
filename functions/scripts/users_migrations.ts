/**
 * Migrations script
 * 
 * To run:
 * `npx tsx scripts/migrations.ts `
 */

import { db } from "../src/config/firebase"
import { FieldValue } from "firebase-admin/firestore"

/**
 * How to use it:
 * 
 * `moveToSubcollection("users", "jgxeAa33YZqTYjLQ0qoG", "users/jgxeAa33YZqTYjLQ0qoG/6.0")`
 * 
 * @param parentCollection The root collection name
 * @param docId The docId that lives within the parentCollection
 * @param subcollectionName The name of the subcollection
 * @param ignoreExists To ignore if data already present
 */
async function moveToSubcollection(
    parentCollection: string,
    docId: string,
    subcollectionName: string,
    fields: string[],
    ignoreExists?: boolean
) {
    const sourceRef = db.collection(parentCollection).doc(docId)
    const targetRef = db.collection(parentCollection).doc(docId).collection(subcollectionName).doc(docId)

    const [snapshot, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()])

    if (!snapshot.exists) {
        throw new Error(`Document not found: ${docId}`)
    }
    // if (targetSnap.exists && !ignoreExists) {
    //     console.log(`Already migrated: ${docId}, skipping`)
    //     return
    // }

    const data = snapshot.data()!
    const batch = db.batch()
    // batch.set(targetRef, Object.fromEntries(fields.map(f => [f, data[f] ?? null])), { merge: true })
    batch.set(targetRef, Object.fromEntries(fields.map(f => [f, data[f] ?? null])))
    batch.update(sourceRef, Object.fromEntries(fields.map(f => [f, FieldValue.delete()])))
    await batch.commit()
}

/**
 * Migrate all data.
 * @param subcollectionName Name of destination subcollection inside the docs
 * @param chunkSize How many docs processed
 */
async function migrateAll(subcollectionName: string, chunkSize = 400) {
    const fields = [
        "status", "github", "linkedin", "portfolio",
        "education", "school", "team", "year",
        "createdAt", "updatedAt", "acceptedAt",
    ]

    const allDocs = await db.collection("users")
    .get()
    const ids = allDocs.docs.map(d => d.id)
    console.log(`Total documents: ${ids.length}`)

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        await Promise.allSettled(
            chunk.map(id =>
                moveToSubcollection("users", id, subcollectionName, fields)
                    .then(() => console.log(`Migrated: ${id}`))
                    .catch(err => console.error(`Failed: ${id}`, err))
            )
        )
        console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
    }
}

/**
 * Migrate all data mentor.
 * @param subcollectionName Name of destination subcollection inside the docs
 * @param chunkSize How many docs processed
 */
async function migrateAllMentors(subcollectionName: string, chunkSize = 400) {
    const fields = [
        "discordUsername", "firstTimePassword", "intro", "mentor", "specialization"
    ]

    const allDocs = await db.collection("users")
    .where("mentor", "==", false)
    .get()
    const ids = allDocs.docs.map(d => d.id)
    console.log(`Total documents: ${ids.length}`)

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        await Promise.allSettled(
            chunk.map(id =>
                moveToSubcollection("users", id, subcollectionName, fields, true)
                    .then(() => console.log(`Migrated: ${id}`))
                    .catch(err => console.error(`Failed: ${id}`, err))
            )
        )
        console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
    }
}

async function migrateAllApplications(subcollectionName: string, chunkSize = 400) {
    const fields = [
        "accommodations", "bigProblem", "blood_type", "code_of_conduct", "desiredRoles", "dietary_restrictions", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship", "evaluationNotes", "garudaHacksAttendance", "hackathonCount", "interestingProject", "liability_waiver", "list_teammates", "lookingForTeammates", "medical_consent", "medical_info", "motivation", "referralSource", "resume", "score", "createdAt", "updatedAt", "referral_code"
    ]

    const allDocs = await db.collection("applications")
    // .where()
    .get()
    const ids = allDocs.docs.map(d => d.id)
    console.log(`Total documents: ${ids.length}`)

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        await Promise.allSettled(
            chunk.map(id =>
                moveToSubcollection("applications", id, subcollectionName, fields, false)
                    .then(() => console.log(`Migrated: ${id}`))
                    .catch(err => console.error(`Failed: ${id}`, err))
            )
        )
        console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
    }
}

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
    // await migrateAll("6.0")
    // await migrateAllMentors("6.0")
    await migrateAllApplications("6.0")
    // await deleteFieldsFromCollection("users", [
    //     "userId", "accommodations", "bigProblem", "blood_type", "code_of_conduct", "desiredRoles", "dietary_restrictions", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship", "evaluationNotes", "garudaHacksAttendance", "hackathonCount", "interestingProject", "liability_waiver", "list_teammates", "lookingForTeammates", "medical_consent", "medical_info", "motivation", "referralSource", "resume", "score",
    // ])
})()

