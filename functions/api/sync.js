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

function emptyRoomDoc() {
  return {
    schedules: {},
    notes: {},
    updatedAt: 0,
    lastUpdatedBy: ''
  };
}

async function readRoomDoc(kv, roomCode) {
  const raw = await kv.get(`room:${roomCode}`, 'json');
  if (!raw || typeof raw !== 'object') {
    return emptyRoomDoc();
  }
  return {
    schedules: raw.schedules && typeof raw.schedules === 'object' ? raw.schedules : {},
    notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    updatedAt: Number(raw.updatedAt) || 0,
    lastUpdatedBy: String(raw.lastUpdatedBy || '')
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.LICH_KV) {
    return jsonResponse(
      { error: 'Server chưa gắn Cloudflare KV binding tên LICH_KV.' },
      503
    );
  }

  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get('room'));
  if (!roomCode) {
    return jsonResponse(
      { error: 'Mã phòng không hợp lệ (cần 4-40 ký tự chữ, số, - hoặc _).' },
      400
    );
  }

  const doc = await readRoomDoc(env.LICH_KV, roomCode);
  return jsonResponse(doc);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.LICH_KV) {
    return jsonResponse(
      { error: 'Server chưa gắn Cloudflare KV binding tên LICH_KV.' },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Body JSON không hợp lệ.' }, 400);
  }

  const roomCode = normalizeRoomCode(body.room);
  if (!roomCode) {
    return jsonResponse(
      { error: 'Mã phòng không hợp lệ (cần 4-40 ký tự chữ, số, - hoặc _).' },
      400
    );
  }

  const action = String(body.action || '');
  const updatedBy = String(body.updatedBy || 'Thành viên').trim().slice(0, 30);
  const doc = await readRoomDoc(env.LICH_KV, roomCode);

  if (action === 'update_day') {
    const monthKey = String(body.monthKey || '');
    const day = Number(body.day);
    if (!/^\d{4}-\d{2}$/.test(monthKey) || !Number.isInteger(day) || day < 1 || day > 31) {
      return jsonResponse({ error: 'Thông tin ngày/tháng không hợp lệ.' }, 400);
    }

    if (!doc.schedules[monthKey]) doc.schedules[monthKey] = {};
    if (!doc.notes[monthKey]) doc.notes[monthKey] = {};

    const shift = String(body.shift || '').trim().toUpperCase().slice(0, 10);
    if (shift) {
      doc.schedules[monthKey][day] = shift;
    } else {
      delete doc.schedules[monthKey][day];
    }

    const note = String(body.note || '').trim().slice(0, 300);
    if (note) {
      doc.notes[monthKey][day] = note;
    } else {
      delete doc.notes[monthKey][day];
    }
  } else if (action === 'import_month') {
    const monthKey = String(body.monthKey || '');
    if (!/^\d{4}-\d{2}$/.test(monthKey) || !body.shifts || typeof body.shifts !== 'object') {
      return jsonResponse({ error: 'Dữ liệu tháng không hợp lệ.' }, 400);
    }

    const cleanShifts = {};
    for (const [d, code] of Object.entries(body.shifts)) {
      const dayNum = Number(d);
      const cleanCode = String(code || '').trim().toUpperCase().slice(0, 10);
      if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 && cleanCode) {
        cleanShifts[dayNum] = cleanCode;
      }
    }

    if (body.mergeMode === 'merge' && doc.schedules[monthKey]) {
      doc.schedules[monthKey] = { ...doc.schedules[monthKey], ...cleanShifts };
    } else {
      doc.schedules[monthKey] = cleanShifts;
    }
  } else if (action === 'restore_backup') {
    doc.schedules = body.schedules && typeof body.schedules === 'object' ? body.schedules : {};
    doc.notes = body.notes && typeof body.notes === 'object' ? body.notes : {};
  } else if (action === 'clear_all') {
    doc.schedules = {};
    doc.notes = {};
  } else {
    return jsonResponse({ error: 'Action đồng bộ không hợp lệ.' }, 400);
  }

  doc.updatedAt = Date.now();
  doc.lastUpdatedBy = updatedBy;

  await env.LICH_KV.put(`room:${roomCode}`, JSON.stringify(doc));
  return jsonResponse(doc);
}
