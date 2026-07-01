// /**
//  * Utility script: upload a local file to a Firebase Storage object path,
//  * overwriting whatever is currently there.
//  *
//  * WARNING: this overwrites production data. There is no undo. Consider
//  * downloading the existing object first (see check_storage_file.ts).
//  *
//  * To run:
//  *   npx tsx scripts/replace_storage_file.ts <localFile> <destObjectPath> [contentType]
//  *
//  * Example:
//  *   npx tsx scripts/replace_storage_file.ts ./my_consent.pdf \
//  *     users/uploads/7.0/y5YLcuYgWAQo8c3rcQHDoqejJfj1_signedConsent.pdf application/pdf
//  */

// import * as admin from "firebase-admin"
// import * as fs from "fs"
// import * as path from "path"

// const serviceAccount = require(path.resolve(__dirname, "../prod-key.json"))

// const STORAGE_BUCKET =
//   process.env.STORAGE_BUCKET ?? `${serviceAccount.project_id}.firebasestorage.app`

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   storageBucket: STORAGE_BUCKET,
// })

// function getBucket() {
//   return admin.storage().bucket()
// }

// /**
//  * Guess a content type from a file extension. Falls back to octet-stream.
//  */
// function guessContentType(filePath: string): string {
//   const ext = path.extname(filePath).toLowerCase()
//   const map: Record<string, string> = {
//     ".pdf": "application/pdf",
//     ".png": "image/png",
//     ".jpg": "image/jpeg",
//     ".jpeg": "image/jpeg",
//     ".txt": "text/plain",
//     ".json": "application/json",
//   }
//   return map[ext] ?? "application/octet-stream"
// }

// /**
//  * Upload a local file to a destination object path, overwriting it.
//  * @param localFile path to the file on disk
//  * @param destObjectPath object name in the bucket (NO leading slash)
//  * @param contentType optional MIME type override
//  */
// async function replaceFile(localFile: string, destObjectPath: string, contentType?: string) {
//   if (!fs.existsSync(localFile)) {
//     throw new Error(`Local file not found: ${localFile}`)
//   }
//   if (destObjectPath.startsWith("/")) {
//     // Firebase Storage object names have no leading slash.
//     destObjectPath = destObjectPath.slice(1)
//   }

//   const bucket = getBucket()
//   const file = bucket.file(destObjectPath)
//   const resolvedType = contentType ?? guessContentType(localFile)

//   const [existedBefore] = await file.exists()
//   const localSize = fs.statSync(localFile).size

//   console.log(`Bucket:      ${bucket.name}`)
//   console.log(`Local file:  ${localFile} (${localSize} bytes)`)
//   console.log(`Destination: ${destObjectPath}`)
//   console.log(`ContentType: ${resolvedType}`)
//   console.log(`Overwriting existing object: ${existedBefore ? "YES" : "no (creating new)"}`)
//   console.log("---")

//   await bucket.upload(localFile, {
//     destination: destObjectPath,
//     contentType: resolvedType,
//     metadata: {
//       contentType: resolvedType,
//       // Serve replacements fresh instead of the GCS default (public, max-age=3600).
//       cacheControl: "no-cache, max-age=0",
//     },
//   })

//   // The app uploads make files public and serves plain storage.googleapis.com
//   // URLs (see application_controller.ts). Re-grant public read so the admin
//   // dashboard's stored URL keeps working after a replacement.
//   await file.makePublic()

//   const [metadata] = await file.getMetadata()
//   console.log("Upload complete.")
//   console.log(`  size:    ${metadata.size} bytes`)
//   console.log(`  updated: ${metadata.updated}`)
// }

// ;(async () => {
//   const [localFile, destObjectPath, contentType] = process.argv.slice(2)

//   if (!localFile || !destObjectPath) {
//     console.error(
//       "Usage: npx tsx scripts/replace_storage_file.ts <localFile> <destObjectPath> [contentType]"
//     )
//     process.exit(1)
//   }

//   try {
//     await replaceFile(localFile, destObjectPath, contentType)
//   } catch (err) {
//     console.error("Error replacing storage file:", err)
//     process.exit(1)
//   }
// })()
