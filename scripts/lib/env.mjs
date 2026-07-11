// env.mjs - marker base64: tuong minh + validate theo ngu canh
// Quy tac: gia tri co prefix 'base64:' -> decode phan sau; khong co -> RAW.
// Bo auto-detect (token thuan JWT/hex vo tinh hop le base64 se bi decode nham).

export function decodeMarker(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('base64:')) {
    const raw = value.slice('base64:'.length);
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return value;
}

// Decode + validate JSON (dung cho RTDB_SERVICE_ACCOUNT...)
export function decodeJson(value, { name = 'value' } = {}) {
  const decoded = decodeMarker(value);
  try {
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error(`${name}: sau decode khong JSON.parse duoc (kiem tra marker base64: hoac noi dung).`);
  }
}

export function bool(value, def = false) {
  if (value == null || value === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function required(value, name) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`Thieu env bat buoc: ${name}`);
  }
  return value;
}
