const express = require("express");
const userRoutes = require("./users");
const applicationRoutes = require("./application");

const router = express.Router();

router.use("/users", userRoutes);
router.use("/applications", applicationRoutes);

module.exports = router;
