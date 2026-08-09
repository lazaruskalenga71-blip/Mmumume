import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

function getLocalRuleTranslation(text: string): string {
  const lower = text.toLowerCase().trim();
  if (lower.includes("hello") || lower.includes("greetings") || lower.includes("hi")) return "Mwapoleni.";
  if (lower.includes("how are you") || lower.includes("how's it going")) return "Muli shani?";
  if (lower.includes("thank you") || lower.includes("thanks")) return "Natotela.";
  if (lower.includes("food") || lower.includes("eat") || lower.includes("hungry")) return "Ndefwaya ukulya.";
  if (lower.includes("water") || lower.includes("drink")) return "Amenshi yafilwa.";
  if (lower.includes("marriage") || lower.includes("wedding")) return "Icupo candi cinshi?";
  if (lower.includes("welcome") || lower.includes("how was your sleep")) return "Mwalisheni?";
  if (lower.includes("not feeling well") || lower.includes("sick") || lower.includes("bad")) return "Nomba nshili bwino.";
  
  return text;
}

// API endpoint for translation from English to Bemba
app.post("/api/translate", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Missing 'text' parameter in body." });
    }

    const trimmedText = text.trim();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn("[TRANSLATE] GEMINI_API_KEY environment variable is missing. Using local translation rules.");
      const bembaText = getLocalRuleTranslation(trimmedText);
      return res.json({
        englishText: trimmedText,
        bembaText,
        translatedBy: "local_rules_fallback",
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert English-to-Bemba (Chibemba) translator.
Translate the following English text accurately and naturally into spoken Bemba (Chibemba).
Do NOT include any explanations, markdown, quotes, or pronunciation guides. Return ONLY the translated Bemba text string.

English text: "${trimmedText}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    const translatedBemba = (response.text || "").trim().replace(/^["']|["']$/g, "");
    const bembaText = translatedBemba || getLocalRuleTranslation(trimmedText);

    return res.json({
      englishText: trimmedText,
      bembaText,
      translatedBy: "gemini-3.6-flash",
    });
  } catch (error: any) {
    console.error("[TRANSLATE] Gemini translation error:", error);
    const fallbackBemba = getLocalRuleTranslation(req.body?.text || "");
    return res.json({
      englishText: req.body?.text || "",
      bembaText: fallbackBemba,
      translatedBy: "fallback_on_error",
      error: error.message || String(error),
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Muntu Bemba TTS Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
