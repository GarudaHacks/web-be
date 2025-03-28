import { onRequest } from "firebase-functions/v2/https";
import * as dotenv from "dotenv";
import app from "./server";

dotenv.config();

export const api = onRequest((request, response) => {
  app(request, response);
});
