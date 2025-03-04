const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const routes = require("./routes");

// Debug logs – comment if not needed
app.use("/", (req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.path}`);
  next();
});
app.use("/", routes);


app.get("/", (req, res) => {
  res.send("API is running");
});

// Start server locally if not running inside Firebase
if (process.env.NODE_ENV !== "production") {
  app.listen(4000, () => {
    console.log("Server running on http://localhost:4000");
  });
}

module.exports = app;
