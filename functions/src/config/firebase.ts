import * as admin from "firebase-admin";
import * as serviceAccount from "../../service-key.json";
import { FakeDataPopulator } from "../utils/fake_data_populator";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

if (process.env.FUNCTIONS_EMULATOR) {
  console.log("Populating fake data");
  
  const populator = new FakeDataPopulator(db);
  populator.generateFakeData();
}

export { admin, db };
