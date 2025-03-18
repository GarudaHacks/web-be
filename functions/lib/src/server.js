"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Debug logs – comment if not needed
app.use("/", (req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.path}`);
    next();
});
app.use("/", routes_1.default);
app.get("/", (req, res) => {
    res.send("API is running");
});
// Start server locally if not running inside Firebase
if (process.env.NODE_ENV !== "production") {
    app.listen(4000, () => {
        console.log("Server running on http://localhost:4000");
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map