import express from "express";
import {
  getApplicationStatus,
  getApplicationQuestion,
  getApplicationQuestions,
  patchApplication,
  uploadFile
} from "../controllers/application_controller";

const router = express.Router();

router.patch("/", patchApplication);
router.post("/file-upload", uploadFile);
router.get("/questions", getApplicationQuestions)
router.get("/question", getApplicationQuestion)
router.get("/status", getApplicationStatus)

export default router;
