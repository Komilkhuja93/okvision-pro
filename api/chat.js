// ═══════════════════════════════════════════════════════════════════════════
// OKVISION Pro — AI maslahatchi serveri (Vercel serverless)
//
// Ishlash tartibi:
//   1) ANTHROPIC_API_KEY bo'lsa  → Claude (pullik, sifatliroq)
//   2) GEMINI_API_KEY bo'lsa     → Google Gemini (BEPUL tarif)
//   3) Hech biri yo'q            → aniq xato xabari
//
// Kalitlar Vercel → Settings → Environment Variables ga qo'yiladi.
// Keyin Claude'ga o'tish: shunchaki ANTHROPIC_API_KEY qo'shing — kod o'zgarmaydi.
// ═══════════════════════════════════════════════════════════════════════════
 
export default async function handler(req, res) {
  // CORS (xuddi shu domen, lekin xavfsizlik uchun)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
 
  const { system = '', messages = [], max_tokens = 1000 } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages bo\'sh' });
  }
 
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
 
  try {
    // ── 1) Claude (pullik — kalit qo'yilganda avtomatik ishlaydi) ──
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
          max_tokens,
          system,
          messages,
        }),
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }
 
    // ── 2) Gemini (BEPUL) ──
    if (geminiKey) {
      // Anthropic format → Gemini format
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{
          text: typeof m.content === 'string'
            ? m.content
            : (Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n') : String(m.content || ''))
        }],
      }));
 
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: system }] },
            generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
          }),
        }
      );
      const g = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: g.error?.message || 'Gemini xatosi' });
      }
      const text = (g.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') || '';
      // Mijoz kodi o'zgarmasligi uchun Anthropic ko'rinishida qaytaramiz
      return res.status(200).json({
        content: [{ type: 'text', text }],
        model,
        provider: 'gemini',
      });
    }
 
    // ── 3) Kalit yo'q ──
    return res.status(500).json({
      error: 'API kalit sozlanmagan. Vercel → Settings → Environment Variables ga GEMINI_API_KEY (bepul) yoki ANTHROPIC_API_KEY qo\'shing, keyin Redeploy qiling.',
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
