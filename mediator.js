// mediator.js — Express mediator for NL -> structured action (NO node-fetch)

const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const STORE_WEBHOOK = process.env.STORE_WEBHOOK || "";

// Build prompt/system message to force JSON output
function buildOpenAIPayload(text) {
  const system = `You are an assistant that extracts a single intent and structured slots from a user's project-management message.
Return only valid JSON with keys:
intent (one of: create_project, add_task, assign_task, update_status, list_projects, list_tasks, due_on, report, unknown),
project (string or empty),
title (string or empty),
assignee (string or empty),
task_id (string or empty),
due_date (YYYY-MM-DD or keywords like today,tomorrow or empty),
raw (original text).
Do not add extra commentary.`;

  return {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `User message: """${text}"""` }
    ],
    max_tokens: 500,
    temperature: 0
  };
}

app.post("/nlp", async (req, res) => {
  try {
    const text = (req.body.text || "").toString();
    if (!text) return res.status(400).json({ error: "no text" });

    const payload = buildOpenAIPayload(text);

    // Native fetch() (Node 18+)
    const oa = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const oaJson = await oa.json();
    const content = oaJson.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return res.status(500).json({ error: "openai_parse_failed", raw_openai: oaJson });
    }

    parsed.raw = text;

    let storeResponse = null;
    if (STORE_WEBHOOK) {
      try {
        const sr = await fetch(STORE_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        });
        storeResponse = await sr.text();
      } catch (err) {
        storeResponse = "store_error: " + err.toString();
      }
    }

    return res.json({ nlp: parsed, store_response: storeResponse });

  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Mediator listening on", PORT));
