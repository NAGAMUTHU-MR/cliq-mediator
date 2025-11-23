// api/nlp.js  (for Vercel Serverless Functions)
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const body = req.body || (await new Promise(r => {
      let data = "";
      req.on("data", c => data += c);
      req.on("end", () => r(JSON.parse(data || "{}")));
    }));
    const text = (body.text || "").toString();
    if (!text) return res.status(400).json({ error: "no text" });

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set" });

    // Minimal prompt forcing JSON-only output
    const system = `You are an assistant that extracts a single intent and structured slots from a user's project-management message.
Return only valid JSON with keys: intent (one of: create_project, add_task, assign_task, update_status, list_projects, list_tasks, due_on, report, unknown), project, title, assignee, task_id, due_date, raw. No extra text.`;
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `User message: """${text}"""` }
      ],
      max_tokens: 400,
      temperature: 0
    };

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
    try { parsed = JSON.parse(content); }
    catch (e) {
      // return raw_openai for debugging
      return res.status(500).json({ error: "openai_parse_failed", raw_openai: oaJson });
    }

    parsed.raw = text;
    // Optionally forward to STORE_WEBHOOK if set (non-blocking ideally)
    if (process.env.STORE_WEBHOOK) {
      try {
        await fetch(process.env.STORE_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        });
      } catch (e) { /* ignore store error to avoid failing main response */ }
    }

    return res.status(200).json({ nlp: parsed });
  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
}
