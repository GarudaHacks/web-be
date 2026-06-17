import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Resend } from "resend";

dotenv.config();

const isDeployed = !!process.env.K_SERVICE;

if (process.env.NODE_ENV === "development") {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  admin.initializeApp({ projectId: process.env.PROJECT_ID });
} else if (isDeployed) {
  admin.initializeApp({ storageBucket: process.env.STORAGE_BUCKET });
} else {
  const serviceAccount = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../service-key.json"), "utf-8")
  );
  admin.initializeApp({
    projectId: process.env.PROJECT_ID,
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    storageBucket: process.env.STORAGE_BUCKET,
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();

// Email service
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Populate Firestore with fake data if running in emulator
 * This is useful for testing the API locally
 * Comment out this block if you don't want to use fake data
 */
// import { FakeDataPopulator } from "../utils/fake_data_populator";
// if (process.env.FIRESTORE_EMULATOR_HOST !== undefined) {
//   const populator = new FakeDataPopulator(db);
//   populator.generateFakeData();
// }

export { admin, db, auth, resend };
