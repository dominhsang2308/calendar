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

  const body = req.body || {};
  const base64Data = String(body.base64Data || '').trim();
  const mimeType = String(body.mimeType || 'image/jpeg').trim();

  if (!base64Data || base64Data.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: 'Ảnh không hợp lệ hoặc vượt quá dung lượng.' });
    return;
  }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const safeMime = allowedMimes.includes(mimeType.toLowerCase()) ? mimeType : 'image/jpeg';

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Analyze this work schedule calendar image. Extract the month (1-12), year (e.g., 2026), and a list of days with their shift codes (such as C, C2, B, AL, OFF, etc.). Ignore shift time legends, only extract the short code shown under each day number.'
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
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
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
      }
    }
  };

  const primaryModel = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const modelsToTry = Array.from(new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3-flash-preview']));

  let lastStatus = 500;
  let lastErrorMsg = '';

  for (const model of modelsToTry) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const gemRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (gemRes.ok) {
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
      return;
    }

    lastStatus = gemRes.status;
    const rawErr = await gemRes.text();
    try {
      const parsedErr = JSON.parse(rawErr);
      lastErrorMsg = parsedErr?.error?.message || rawErr;
    } catch {
      lastErrorMsg = rawErr;
    }
    if (/api key/i.test(lastErrorMsg)) break;
  }

  res.status(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502).json({
    error: `Lỗi gọi Gemini API (${lastStatus}): ${lastErrorMsg.slice(0, 180)}`
  });
}
