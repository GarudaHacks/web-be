import * as admin from "firebase-admin";
import * as serviceAccount from "../../service-key.json";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

export {admin, db};
