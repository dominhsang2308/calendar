export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
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

  function buildPayload({ useSchema = true, useMinimalThinking = true } = {}) {
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
    if (useMinimalThinking) {
      generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
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
      signal: AbortSignal.timeout(22000)
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

  const primaryModel = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const modelsToTry = Array.from(new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3-flash-preview']));

  let lastStatus = 500;
  const triedErrors = [];

  for (const model of modelsToTry) {
    try {
      let gemRes = await callGemini(model, { useSchema: true, useMinimalThinking: true });
      if (gemRes.ok) {
        await parseSuccess(gemRes);
        return;
      }

      let msg = await extractErr(gemRes);
      if (gemRes.status === 400 && !/api key/i.test(msg)) {
        gemRes = await callGemini(model, { useSchema: true, useMinimalThinking: false });
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
