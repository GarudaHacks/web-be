const admin = require("firebase-admin");
const serviceAccount = require("../service-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "garuda-hacks-6-0.firebasestorage.app",
});

const db = admin.firestore();

module.exports = {admin, db};
