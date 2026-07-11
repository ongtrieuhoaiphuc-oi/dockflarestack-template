// logger.mjs - log ro tung buoc, mask secret (chi hien 4 ky tu cuoi)
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CUR = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? 20;

function ts() { return new Date().toISOString(); }

export function mask(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.length <= 4) return '****';
  return '****' + s.slice(-4);
}

function emit(level, scope, msg, extra) {
  if (LEVELS[level] < CUR) return;
  const line = `[${ts()}] [${level.toUpperCase()}] [${scope}] ${msg}`;
  const out = level === 'error' ? console.error : console.log;
  if (extra !== undefined) out(line, extra); else out(line);
}

export function makeLogger(scope) {
  return {
    debug: (m, e) => emit('debug', scope, m, e),
    info: (m, e) => emit('info', scope, m, e),
    warn: (m, e) => emit('warn', scope, m, e),
    error: (m, e) => emit('error', scope, m, e),
    step: (n, m) => emit('info', scope, `STEP ${n}: ${m}`),
  };
}
