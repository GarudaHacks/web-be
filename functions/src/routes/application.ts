import express from "express";
import {
  getApplicationQuestion,
  getApplicationQuestions,
  patchApplication,
  uploadFile
} from "../controllers/application_controller";
import {validateFirebaseIdToken} from "../middlewares/auth_middleware";

const router = express.Router();

router.use(validateFirebaseIdToken)

router.patch("/", patchApplication);
router.post("/file-upload", uploadFile);
router.get("/questions", getApplicationQuestions)
router.get("/question", getApplicationQuestion)

export default router;
