import express from "express";
import {
  getApplicationStatus,
  getApplicationQuestion,
  getApplicationQuestions,
  patchApplication,
  uploadFile,
  setApplicationStatusToSubmitted,
  setApplicationStatusToConfirmedRsvp,
  uploadConsentForm,
} from "../controllers/application_controller";

const router = express.Router();

router.patch("/", patchApplication);

router.post("/file-upload", uploadFile);

router.get("/questions", getApplicationQuestions);
router.get("/question", getApplicationQuestion);

router.post("/status", setApplicationStatusToSubmitted);
router.get("/status", getApplicationStatus);

router.post("/rsvp", setApplicationStatusToConfirmedRsvp);
router.post("/consent-form", uploadConsentForm);

export default router;
