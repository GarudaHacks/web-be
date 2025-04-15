import * as admin from "firebase-admin";
import * as serviceAccount from "../../service-key.json";
import * as dotenv from "dotenv";

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

/**
 * Populate Firestore with fake data if running in emulator
 * This is useful for testing the API locally
 * Comment out this block if you don't want to use fake data
*/
import { FakeDataPopulator } from "../utils/fake_data_populator";
if (process.env.FIRESTORE_EMULATOR_HOST !== undefined) {
  const populator = new FakeDataPopulator(db);
  populator.generateFakeData();
}

export { admin, db, auth };
