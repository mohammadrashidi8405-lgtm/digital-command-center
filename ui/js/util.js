export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function relTime(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function scoreBadgeClass(score, threshold = 85) {
  if (score >= threshold) return 'badge--ok';
  if (score >= threshold - 20) return 'badge--warn';
  return 'badge--neutral';
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function skeletonBlock(count = 3) {
  return `<div class="stack">${Array.from({ length: count }).map(() => '<div class="skeleton"></div>').join('')}</div>`;
}
