import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "错题克星.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    const { model, messages, response_format, ...rest } = req.body || {};

    if (!model || !messages) {
      return res.status(400).json({
        error: { message: "model and messages are required" }
      });
    }

    const completion = await client.chat.completions.create({
      model,
      messages,
      response_format,
      ...rest
    });

    const content = completion?.choices?.[0]?.message?.content ?? "";
    let parsed = null;
    if (typeof content === "string" && content.trim()) {
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        try {
          const repaired = jsonrepair(content);
          parsed = JSON.parse(repaired);
        } catch {
          parsed = null;
        }
      }
    }

    return res.json({ ...completion, parsed });
  } catch (err) {
    const status = err?.status || err?.response?.status || 500;
    const message = err?.error?.message || err?.message || "Upstream error";
    return res.status(status).json({ error: { message } });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});
