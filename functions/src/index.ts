import * as functions from "firebase-functions";
import * as dotenv from "dotenv";
import app from "./server";

dotenv.config();

exports.app = functions.https.onRequest(app);
