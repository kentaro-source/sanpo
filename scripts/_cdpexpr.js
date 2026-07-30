(() => {
  const out = { visibility: document.visibilityState };
  out.purgeFlag = localStorage.getItem('sanpo-dircache-purge-v1');
  try {
    const c = JSON.parse(localStorage.getItem('sanpo-directions-cache-v2') || '{}');
    const e = Object.entries(c);
    out.entries = e.length;
    out.withPath = e.filter(([, v]) => v && v.path).length;
    out.nulls = e.filter(([, v]) => !v || !v.path).length;
    out.chars = JSON.stringify(c).length;
    const sizes = e
      .filter(([, v]) => v && v.path)
      .map(([, v]) => v.path.length)
      .sort((a, b) => b - a);
    out.largestPathPoints = sizes[0] ?? 0;
  } catch (err) {
    out.err = String(err);
  }
  out.stops = [...document.querySelectorAll('li')]
    .map((li) => li.innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  return out;
})();
