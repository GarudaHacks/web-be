"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const users_controller_1 = require("../controllers/users_controller");
const router = express_1.default.Router();
router.post("/create", (req, res) => (0, users_controller_1.createUser)(req, res));
router.get("/", (req, res) => (0, users_controller_1.getUsers)(req, res));
exports.default = router;
//# sourceMappingURL=users.js.map