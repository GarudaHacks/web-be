/**
 * Migration script: write userId field (= document ID) to each document
 * in a collection if it does not already exist.
 *
 * To run:
 *   npx tsx scripts/add_userId_field.ts
 */

import { db } from "../src/config/firebase"

const COLLECTION = "users"

async function addUserIdToDoc(docId: string) {
    const ref = db.collection(COLLECTION).doc(docId)
    const snap = await ref.get()

    if (!snap.exists) {
        console.warn(`Document not found: ${docId}`)
        return
    }

    const data = snap.data()!

    if (Object.prototype.hasOwnProperty.call(data, "userId")) {
        console.log(`Already has userId: ${docId}`)
        return
    }

    await ref.update({ userId: docId })
    console.log(`Set userId on: ${docId}`)
}

async function migrateCollection(chunkSize = 400) {
    const allDocs = await db.collection(COLLECTION).get()
    const ids = allDocs.docs.map(d => d.id)
    console.log(`Total documents: ${ids.length}`)

    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        await Promise.allSettled(
            chunk.map(id =>
                addUserIdToDoc(id)
                    .catch(err => console.error(`Failed: ${id}`, err))
            )
        )
        console.log(`Chunk ${Math.floor(i / chunkSize) + 1} done (${i + chunk.length}/${ids.length})`)
    }

    console.log("Migration complete.")
}

;(async () => {
    await migrateCollection()
})()
