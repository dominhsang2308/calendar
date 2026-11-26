export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

  // Chẩn đoán nhanh khi mở /api/scan bằng trình duyệt (GET)
  if (req.method === 'GET') {
    if (!apiKey) {
      res.status(500).json({ ok: false, error: 'Thiếu GEMINI_API_KEY trên Vercel.' });
      return;
    }
    const t0 = Date.now();
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const listData = await listRes.json().catch(() => ({}));
      if (!listRes.ok) {
        res.status(listRes.status).json({
          ok: false,
          ms: Date.now() - t0,
          error: listData?.error?.message || `HTTP ${listRes.status}`
        });
        return;
      }
      const flashModels = (listData.models || [])
        .filter((m) => /flash/i.test(m.name || '') && (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => String(m.name).replace(/^models\//, ''))
        .slice(0, 10);

      const testModel = String(process.env.GEMINI_MODEL || 'gemini-flash-latest').trim();
      const pingRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }],
            generationConfig: { maxOutputTokens: 16 }
          }),
          signal: AbortSignal.timeout(8000)
        }
      );
      const pingBody = await pingRes.json().catch(() => ({}));
      res.status(200).json({
        ok: pingRes.ok,
        region: process.env.VERCEL_REGION || 'unknown',
        ms: Date.now() - t0,
        testedModel: testModel,
        pingStatus: pingRes.status,
        pingReply: pingBody?.candidates?.[0]?.content?.parts?.[0]?.text || pingBody?.error?.message || null,
        flashModels
      });
    } catch (err) {
      res.status(504).json({ ok: false, ms: Date.now() - t0, error: err.message });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (!apiKey) {
    res.status(500).json({ error: 'Vercel chưa cấu hình GEMINI_API_KEY.' });
    return;
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ.' });
      return;
    }
  }

  const base64Data = String(body.base64Data || '').trim();
  const mimeType = String(body.mimeType || 'image/jpeg').trim();

  if (!base64Data || base64Data.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: 'Ảnh không hợp lệ hoặc vượt quá dung lượng.' });
    return;
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const safeMime = allowedMimes.includes(mimeType.toLowerCase()) ? mimeType : 'image/jpeg';

  function buildPayload({ useSchema = true, thinkingMode = 'minimal' } = {}) {
    const generationConfig = {
      responseMimeType: 'application/json'
    };
    if (useSchema) {
      generationConfig.responseSchema = {
        type: 'OBJECT',
        properties: {
          month: { type: 'INTEGER' },
          year: { type: 'INTEGER' },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                day: { type: 'INTEGER' },
                code: { type: 'STRING' }
              },
              required: ['day', 'code']
            }
          }
        },
        required: ['month', 'year', 'items']
      };
    }
    if (thinkingMode === 'minimal') {
      generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
    } else if (thinkingMode === 'low') {
      generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    }

    return {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: useSchema
                ? 'Analyze this work schedule calendar image. Extract the month (1-12), year (e.g., 2026), and a list of days with their shift codes (such as C, C2, B, AL, OFF, etc.). Ignore shift time legends, only extract the short code shown under each day number.'
                : 'Analyze this work schedule calendar image. Return ONLY valid JSON with format {"month": 11, "year": 2026, "items": [{"day": 1, "code": "C"}]}. Extract month (1-12), year, and short shift codes (C, C2, B, AL, OFF, etc.) under each day number. Ignore legend descriptions.'
            },
            {
              inlineData: {
                mimeType: safeMime,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig
    };
  }

  async function callGemini(model, opts) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(opts)),
      signal: AbortSignal.timeout(9000)
    });
  }

  async function parseSuccess(gemRes) {
    const result = await gemRes.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: 'AI không trả về dữ liệu.' });
      return;
    }
    const parsed = JSON.parse(text);
    const shifts = {};
    for (const entry of parsed.items || []) {
      const dayNum = Number(entry.day);
      const code = String(entry.code || '').trim().toUpperCase().slice(0, 10);
      if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 && code) {
        shifts[dayNum] = code;
      }
    }
    const month = Number(parsed.month);
    const year = Number(parsed.year);
    res.status(200).json({
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
      year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
      shifts
    });
  }

  async function extractErr(gemRes) {
    const rawErr = await gemRes.text();
    try {
      const parsedErr = JSON.parse(rawErr);
      return parsedErr?.error?.message || rawErr;
    } catch {
      return rawErr;
    }
  }

  const primaryModel = String(process.env.GEMINI_MODEL || 'gemini-flash-latest').trim();
  const modelsToTry = Array.from(
    new Set([
      primaryModel,
      'gemini-flash-latest',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash'
    ])
  );

  let lastStatus = 500;
  const triedErrors = [];

  for (const model of modelsToTry) {
    try {
      let gemRes = await callGemini(model, { useSchema: true, thinkingMode: 'minimal' });
      if (gemRes.ok) {
        await parseSuccess(gemRes);
        return;
      }

      let msg = await extractErr(gemRes);
      if (gemRes.status === 400 && !/api key/i.test(msg)) {
        gemRes = await callGemini(model, { useSchema: true, thinkingMode: 'none' });
        if (gemRes.ok) {
          await parseSuccess(gemRes);
          return;
        }
        msg = await extractErr(gemRes);
      }

      lastStatus = gemRes.status;
      triedErrors.push(`${model}(${gemRes.status}): ${msg.slice(0, 90)}`);
      if (/api key/i.test(msg)) break;
    } catch (err) {
      lastStatus = 504;
      triedErrors.push(`${model}(timeout): ${err.message}`);
    }
  }

  res.status(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502).json({
    error: `Lỗi gọi Gemini API (${lastStatus}): ${(triedErrors[0] || '').slice(0, 180)}`,
    detail: triedErrors.join(' | ').slice(0, 400)
  });
}
