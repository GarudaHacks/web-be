const express = require("express");
const { patchApplication, uploadFile } = require("../controllers/applicationController");

const router = express.Router();

router.patch("/", patchApplication);
router.post("/file-upload", uploadFile);

module.exports = router;
