export async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export const api = {
  status: () => fetchJSON('/api/status'),
  settings: () => fetchJSON('/api/settings'),
  saveSettings: (s) => fetchJSON('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }),
  channels: () => fetchJSON('/api/channels'),
  messages: (ch) => fetchJSON('/api/messages/' + ch),
  profiles: () => fetchJSON('/api/profiles'),
  saveProfile: (data) => fetchJSON('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  switchProfile: (id, skip) => fetchJSON('/api/profiles/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, skipCheck: skip }) }),
  refresh: (ch, quiet) => fetch('/api/refresh' + (ch ? '?channel=' + ch : '') + (quiet ? (ch ? '&' : '?') + 'quiet=1' : ''), { method: 'POST' }),
  rescan: () => fetch('/api/rescan', { method: 'POST' }),
  clearCache: () => fetch('/api/cache/clear', { method: 'POST' }),
  versionCheck: () => fetchJSON('/api/version-check', { method: 'POST' }),
  send: (ch, text) => fetchJSON('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: ch, text }) }),
  admin: (cmd, arg) => fetchJSON('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd, arg }) }),
  resolversActive: () => fetchJSON('/api/resolvers/active'),
  resolversBank: () => fetchJSON('/api/resolvers/bank'),
  addToBank: (rs) => fetchJSON('/api/resolvers/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolvers: rs }) }),
  removeFromBank: (addrs) => fetch('/api/resolvers/bank', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addrs }) }),
  removeResolver: (addr) => fetch('/api/resolvers/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addr }) }),
  resetStats: () => fetch('/api/resolvers/reset-stats', { method: 'POST' }),
  bankCleanup: (min, dry) => fetchJSON('/api/resolvers/bank/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minScore: min, dryRun: dry }) }),
  scannerPresets: () => fetchJSON('/api/scanner/presets'),
  scannerStart: (d) => fetchJSON('/api/scanner/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  scannerStop: () => fetch('/api/scanner/stop', { method: 'POST' }),
  scannerPause: () => fetch('/api/scanner/pause', { method: 'POST' }),
  scannerResume: () => fetch('/api/scanner/resume', { method: 'POST' }),
  scannerProgress: () => fetchJSON('/api/scanner/progress'),
};

export function fetchImageBlob(imgId, signal) {
  return fetch('/api/image/' + imgId, { signal }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  });
}

export function connectSSE(onLog, onUpdate) {
  const es = new EventSource('/api/events');
  es.addEventListener('log', e => {
    try { onLog(JSON.parse(e.data)); } catch { onLog(e.data); }
  });
  es.addEventListener('update', e => {
    try { onUpdate(JSON.parse(e.data)); } catch { onUpdate(e.data); }
  });
  es.onerror = () => {
    setTimeout(() => {
      if (es.readyState === EventSource.CLOSED) {
        connectSSE(onLog, onUpdate);
      }
    }, 3000);
  };
  return es;
}
