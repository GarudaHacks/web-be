import express, {Router} from "express";
import {patchApplication, uploadFile} from "../controllers/application_controller";
import {validateFirebaseIdToken} from "../middlewares/auth_middleware";

const router: Router = express.Router();

router.use(validateFirebaseIdToken)

router.patch("/", patchApplication);
router.post("/file-upload", uploadFile);

export default router;
