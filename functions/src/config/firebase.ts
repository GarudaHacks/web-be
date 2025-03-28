import * as admin from "firebase-admin";
import * as serviceAccount from "../../service-key.json";
import { FakeDataPopulator } from "../utils/fake_data_populator";
import * as dotenv from "dotenv";

dotenv.config();

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
  serviceAccountId: process.env.SERVICE_ACCOUNT_ID,
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

// Populate fake data in development mode
if (process.env.NODE_ENV === "development") {
  const populator = new FakeDataPopulator(db);
  populator.generateFakeData();
}

export { admin, db, auth };
