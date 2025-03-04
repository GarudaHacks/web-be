const functions = require("firebase-functions");
const app = require("./server");

// Export as Firebase Cloud Function
exports.app = functions.https.onRequest(app);
