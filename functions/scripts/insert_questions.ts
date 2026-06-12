/**
 * Insert questions into Firestore under the "questions" collection.
 * Each document ID is the question's `id` field.
 *
 * To run:
 *   npx tsx scripts/insert_questions.ts
 *
 * Set NODE_ENV=development to target the local emulator instead of production.
 */

import { db } from "../src/config/firebase"
import { allQuestionsData } from "./pre-insert_questions"

async function insertQuestions() {
  console.log(`Inserting ${allQuestionsData.length} questions into "questions" collection...`)

  const batch = db.batch()

  for (const question of allQuestionsData) {
    const ref = db.collection("questions").doc(question.id)
    batch.set(ref, question)
  }

  await batch.commit()
  console.log("Done.")
}

;(async () => {
  await insertQuestions()
})()
