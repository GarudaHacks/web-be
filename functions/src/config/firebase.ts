import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

if (process.env.NODE_ENV === "development") {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  admin.initializeApp({ projectId: process.env.PROJECT_ID });
} else {
  admin.initializeApp({
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = admin.auth();

// Email service
const transporter = nodemailer.createTransport({
  host: process.env.SES_SMTP_HOST,
  port: Number(process.env.SES_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SES_SMTP_USERNAME,
    pass: process.env.SES_SMTP_PASSWORD,
  },
})

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

export { admin, db, auth, transporter };
