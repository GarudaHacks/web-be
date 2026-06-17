import { db } from "../src/config/firebase"
import type { PortalConfig } from "../src/models/config";

/**
 * Insert configs defined.
 */
async function insertConfig() {
  console.log(`Inserting config`)

  const config: PortalConfig = {
    "applicationsOpen": true,
    "applicationStartDate": new Date('2026-06-6'),
    "applicationCloseDate": new Date('2026-07-01'),
    "applicationReleaseDate": new Date('2026-07-01'),
    "hackathonStartDate": new Date('2026-07-16'),
    "hackathonEndDate": new Date('2026-07-18')
  }
  await db.collection("config").doc("portalConfig").set(config)
  console.log("Done inserting config")
}

; (async () => {
  await insertConfig()
})()
