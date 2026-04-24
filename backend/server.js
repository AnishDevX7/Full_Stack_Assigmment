/**
 * server.js  –  SRM BFHL REST API
 * POST /bfhl  →  processes hierarchical node relationships
 */
 
const express = require("express");
const cors = require("cors");
const { processData } = require("./graphProcessor");
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
 
// ── Identity (replace with your real details before submission) ─────────────
const IDENTITY = {
  user_id: "johndoe_17091999",           // fullname_ddmmyyyy
  email_id: "john.doe@srmist.edu.in",    // your college email
  college_roll_number: "RA2111003010001", // your roll number
};
 
// ── Routes ──────────────────────────────────────────────────────────────────
 
// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "BFHL API is running" });
});
 
// Main endpoint
app.post("/bfhl", (req, res) => {
  try {
    const { data } = req.body;
 
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        error: "Invalid request body. Expected { data: [...] }",
      });
    }
 
    const { hierarchies, invalidEntries, duplicateEdges, summary } =
      processData(data);
 
    return res.status(200).json({
      ...IDENTITY,
      hierarchies,
      invalid_entries: invalidEntries,
      duplicate_edges: duplicateEdges,
      summary,
    });
  } catch (err) {
    console.error("Error processing /bfhl request:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
 
// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`BFHL API listening on port ${PORT}`);
});
 
module.exports = app;
 