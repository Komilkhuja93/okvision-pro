// ═══════════════════════════════════════════════════════════════════════════
// OKVISION Pro — AI maslahatchi serveri (Vercel serverless)
//
// Tartib:
//   1) ANTHROPIC_API_KEY bo'lsa  → Claude (pullik, sifatliroq)
//   2) GEMINI_API_KEY bo'lsa     → Google Gemini (BEPUL)
//   3) Hech biri yo'q            → aniq xato
//
// Kalitlar: Vercel → Settings → Environment Variables → keyin Redeploy.
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Body — Vercel odatda o'zi parse qiladi, lekin ba'zan string keladi
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { system = '', messages = [], max_tokens = 1000 } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages bo'sh" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    // ── 1) Claude ──
    if (anthropicKey) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          max_tokens, system, messages,
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: (data && data.error && data.error.message) || 'Claude xatosi' });
      return res.status(200).json(data);
    }

    // ── 2) Gemini (bepul) ──
    if (geminiKey) {
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{
          text: typeof m.content === 'string'
            ? m.content
            : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n') : String(m.content || '')),
        }],
      }));
      const payload = {
        contents,
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
      };

      const models = [
        process.env.GEMINI_MODEL,
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
      ].filter(Boolean);

      let lastErr = 'Gemini xatosi';
      for (const model of models) {
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + geminiKey,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
        );
        const g = await r.json();
        if (r.ok) {
          const text = ((g.candidates && g.candidates[0] && g.candidates[0].content && g.candidates[0].content.parts) || [])
            .map(p => p.text || '').join('') || '';
          if (text) return res.status(200).json({ content: [{ type: 'text', text }], model, provider: 'gemini' });
          lastErr = "Gemini bo'sh javob qaytardi";
          continue;
        }
        lastErr = (g && g.error && g.error.message) || ('Gemini xatosi (' + r.status + ')');
        if (r.status === 400 && /api key not valid|api_key_invalid/i.test(lastErr)) break;
        if (r.status === 403) break;
      }
      return res.status(500).json({ error: lastErr });
    }

    // ── 3) Kalit yo'q ──
    return res.status(500).json({
      error: "API kalit sozlanmagan. Vercel -> Settings -> Environment Variables ga GEMINI_API_KEY (bepul) qo'shing va Redeploy qiling.",
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
