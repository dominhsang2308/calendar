function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalizeRoomCode(raw) {
  const cleaned = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{4,40}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Nếu cấu hình SCAN_PROXY_URL (ví dụ Vercel đặt tại Mỹ iad1), chuyển tiếp request để tránh chặn vùng ở node biên
  const proxyUrl = String(env.SCAN_PROXY_URL || '').trim();
  if (proxyUrl) {
    try {
      const bodyText = await request.text();
      const proxyRes = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyText
      });
      const resText = await proxyRes.text();
      return new Response(resText, {
        status: proxyRes.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    } catch (err) {
      return jsonResponse({ error: `Không kết nối được SCAN_PROXY_URL: ${err.message}` }, 502);
    }
  }

  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return jsonResponse(
      { error: 'Server chưa cấu hình biến môi trường GEMINI_API_KEY.' },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Dữ liệu gửi lên không hợp lệ.' }, 400);
  }

  // Tùy chọn khóa API AI theo danh sách phòng nếu chủ sở hữu cấu hình ALLOWED_ROOMS
  if (env.ALLOWED_ROOMS) {
    const room = normalizeRoomCode(body.room || request.headers.get('X-Room-Code'));
    const allowed = env.ALLOWED_ROOMS.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!room || !allowed.includes(room)) {
      return jsonResponse(
        { error: 'Mã phòng không nằm trong danh sách được phép quét AI.' },
        403
      );
    }
  }

  const base64Data = String(body.base64Data || '').trim();
  const mimeType = String(body.mimeType || 'image/jpeg').trim();

  if (!base64Data || base64Data.length > 8 * 1024 * 1024) {
    return jsonResponse(
      { error: 'Ảnh không hợp lệ hoặc vượt quá dung lượng cho phép.' },
      400
    );
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

  const primaryModel = String(env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const modelsToTry = Array.from(
    new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3.8-flash-preview', 'gemini-3-flash-preview'])
  );

  let lastStatus = 500;
  let lastErrorMsg = '';
  const triedErrors = [];

  async function callGeminiModel(model, useSchema = true) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const reqPayload = useSchema
      ? payload
      : {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    'Analyze this work schedule calendar image. Return ONLY valid JSON with format {"month": 11, "year": 2026, "items": [{"day": 1, "code": "C"}]}. Extract month (1-12), year, and short shift codes (C, C2, B, AL, OFF, etc.) under each day number. Ignore legend descriptions.'
                },
                payload.contents[0].parts[1]
              ]
            }
          ],
          generationConfig: { responseMimeType: 'application/json' }
        };
    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqPayload)
    });
  }

  async function discoverFlashModels() {
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (!listRes.ok) return [];
      const listData = await listRes.json();
      const candidates = (listData.models || [])
        .filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent') &&
            /flash/i.test(m.name || '') &&
            !/tts|audio|live|thinking|image/i.test(m.name || '')
        )
        .map((m) => String(m.name || '').replace(/^models\//, ''));

      // Sắp xếp ưu tiên model phiên bản mới nhất lên đầu
      return candidates.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {
      return [];
    }
  }

  async function parseGeminiSuccess(res) {
    const result = await res.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return jsonResponse({ error: 'AI không trả về dữ liệu.' }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse({ error: 'Không thể phân tích JSON từ AI.' }, 502);
    }

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

    return jsonResponse({
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
      year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
      shifts
    });
  }

  async function extractErrMsg(res) {
    const rawErr = await res.text();
    try {
      const parsedErr = JSON.parse(rawErr);
      return parsedErr?.error?.message || rawErr;
    } catch {
      return rawErr;
    }
  }

  const triedSet = new Set();
  async function tryModel(model) {
    if (!model || triedSet.has(model)) return null;
    triedSet.add(model);

    let res = await callGeminiModel(model, true);
    if (res.ok) return parseGeminiSuccess(res);

    let msg = await extractErrMsg(res);
    // Nếu 400 không phải do API key, thử gọi lại không dùng responseSchema
    if (res.status === 400 && !/api key/i.test(msg)) {
      res = await callGeminiModel(model, false);
      if (res.ok) return parseGeminiSuccess(res);
      msg = await extractErrMsg(res);
    }

    lastStatus = res.status;
    lastErrorMsg = msg;
    triedErrors.push(`${model}(${res.status}): ${msg.slice(0, 90)}`);
    return null;
  }

  for (const model of modelsToTry) {
    const okRes = await tryModel(model);
    if (okRes) return okRes;
    if (/api key/i.test(lastErrorMsg)) break;
  }

  if (!/api key/i.test(lastErrorMsg)) {
    const discoveredList = await discoverFlashModels();
    for (const model of discoveredList.slice(0, 6)) {
      const okRes = await tryModel(model);
      if (okRes) return okRes;
    }
  }

  return jsonResponse(
    {
      error: `Lỗi gọi Gemini API (${lastStatus}): ${(triedErrors[0] || lastErrorMsg).slice(0, 180)}`,
      detail: triedErrors.join(' | ').slice(0, 400)
    },
    lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502
  );
}
