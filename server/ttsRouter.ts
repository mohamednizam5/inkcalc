import { Router } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);
const router = Router();

// POST /api/tts  { text: string }
// Returns MP3 audio using edge-tts with a deep male voice (en-US-GuyNeural)
// Pitch lowered and rate slightly slowed for a deeper, more natural Jamaican-style delivery
router.post("/", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "text is required" });
  }

  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);

  // Python script using edge-tts with deep male voice
  const pyScript = `
import asyncio
import edge_tts
import sys

async def speak(text, out_file):
    communicate = edge_tts.Communicate(
        text,
        "en-US-GuyNeural",
        rate="-8%",
        pitch="-15Hz",
        volume="+10%"
    )
    await communicate.save(out_file)

asyncio.run(speak(sys.argv[1], sys.argv[2]))
`;

  const scriptFile = path.join(os.tmpdir(), `tts_script_${Date.now()}.py`);

  try {
    fs.writeFileSync(scriptFile, pyScript);
    await execFileAsync("python3", [scriptFile, text.trim(), tmpFile], {
      timeout: 30000,
    });

    if (!fs.existsSync(tmpFile)) {
      throw new Error("TTS output file not created");
    }

    const audioBuffer = fs.readFileSync(tmpFile);
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "public, max-age=3600",
    });
    res.send(audioBuffer);
  } catch (err: any) {
    console.error("[TTS] Error:", err.message);
    // Fallback to gTTS if edge-tts fails
    try {
      const fallbackScript = `
from gtts import gTTS
import sys
t = gTTS(sys.argv[1], lang='en', tld='com.jm', slow=False)
t.save(sys.argv[2])
`;
      const fallbackScriptFile = path.join(os.tmpdir(), `tts_fallback_${Date.now()}.py`);
      fs.writeFileSync(fallbackScriptFile, fallbackScript);
      await execFileAsync("python3", [fallbackScriptFile, text.trim(), tmpFile], { timeout: 20000 });
      if (fs.existsSync(tmpFile)) {
        const audioBuffer = fs.readFileSync(tmpFile);
        res.set({ "Content-Type": "audio/mpeg", "Content-Length": audioBuffer.length });
        res.send(audioBuffer);
        try { fs.unlinkSync(fallbackScriptFile); } catch {}
        return;
      }
      try { fs.unlinkSync(fallbackScriptFile); } catch {}
    } catch (fallbackErr: any) {
      console.error("[TTS] Fallback also failed:", fallbackErr.message);
    }
    res.status(500).json({ error: "TTS generation failed", detail: err.message });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(scriptFile); } catch {}
  }
});

export default router;
