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
    new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'])
  );

  let lastStatus = 500;
  let lastErrorMsg = '';

  async function callGeminiModel(model) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  async function discoverFlashModel() {
    try {
      const listRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (!listRes.ok) return null;
      const listData = await listRes.json();
      const candidates = (listData.models || []).filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          /flash/i.test(m.name || '')
      );
      if (candidates.length === 0) return null;
      // Ưu tiên model flash mới nhất (không phải lite/8b nếu có bản chuẩn)
      const preferred =
        candidates.find((m) => /flash$/i.test(m.name)) || candidates[candidates.length - 1];
      return String(preferred.name || '').replace(/^models\//, '');
    } catch {
      return null;
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

  for (const model of modelsToTry) {
    const res = await callGeminiModel(model);
    if (res.ok) {
      return parseGeminiSuccess(res);
    }

    lastStatus = res.status;
    const rawErr = await res.text();
    try {
      const parsedErr = JSON.parse(rawErr);
      lastErrorMsg = parsedErr?.error?.message || rawErr;
    } catch {
      lastErrorMsg = rawErr;
    }

    // Nếu lỗi là API key không hợp lệ thì dừng ngay để báo rõ
    if (/api key/i.test(lastErrorMsg)) {
      break;
    }
  }

  // Nếu các model mặc định đều báo 404 (đã ngừng hỗ trợ), tự động tìm model Flash đang hoạt động
  if (lastStatus === 404) {
    const discovered = await discoverFlashModel();
    if (discovered && !modelsToTry.includes(discovered)) {
      const res = await callGeminiModel(discovered);
      if (res.ok) {
        return parseGeminiSuccess(res);
      }
      lastStatus = res.status;
      lastErrorMsg = await res.text();
    }
  }

  return jsonResponse(
    {
      error: `Lỗi gọi Gemini API (${lastStatus}): ${lastErrorMsg.slice(0, 160)}`,
      detail: lastErrorMsg.slice(0, 300)
    },
    lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502
  );
}
