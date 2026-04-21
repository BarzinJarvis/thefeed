export function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

export function escAttr(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
}

const avatarColors = [
  'linear-gradient(135deg,#FF6B6B,#ee5a24)','linear-gradient(135deg,#4ecdc4,#2d98da)',
  'linear-gradient(135deg,#a55eea,#8854d0)','linear-gradient(135deg,#26de81,#20bf6b)',
  'linear-gradient(135deg,#fd9644,#e67e22)','linear-gradient(135deg,#fc5c65,#eb3b5a)',
  'linear-gradient(135deg,#45aaf2,#2d98da)','linear-gradient(135deg,#fed330,#f7b731)'
];

export function avatarGradient(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return avatarColors[Math.abs(h) % avatarColors.length];
}

export function avatarLetter(name) {
  let n = name.replace(/^@/, '');
  if (n.toLowerCase().startsWith('x/')) n = n.substring(2);
  return (n || '?').charAt(0).toUpperCase();
}

export function isPersian(text) {
  if (!text) return false;
  const start = text.substring(0, 100);
  let p = 0, l = 0;
  for (let i = 0; i < start.length; i++) {
    const c = start.charCodeAt(i);
    if ((c >= 0x0600 && c <= 0x06FF) || (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF)) p++;
    else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) l++;
  }
  return p > l;
}

export function linkify(text) {
  if (!text) return '';
  const escaped = esc(text);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--accent)">$1</a>');
}

export function normalizeArabic(s) {
  return s.replace(/[يی]/g, 'ي').replace(/[كک]/g, 'ک').replace(/[ؤئإأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/‌/g, '');
}

export function formatTime(ts, lang) {
  const d = new Date(ts * 1000);
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts, lang) {
  const d = new Date(ts * 1000);
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  const opts = lang === 'fa'
    ? { year: 'numeric', month: 'long', day: 'numeric', calendar: 'persian' }
    : { year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString(locale, opts);
}

export function getLastSeen(chName) {
  try { return parseInt(localStorage.getItem('lastSeen_' + chName)) || 0; } catch { return 0; }
}

export function setLastSeen(chName, ts) {
  try { localStorage.setItem('lastSeen_' + chName, ts); } catch {}
}
