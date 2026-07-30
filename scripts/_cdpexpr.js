(() => {
  const out = {};
  // If the precomputed store served the route, NOTHING should have been
  // written to localStorage (precomputed hits are memory-only by design).
  // Anything here means live Directions requests were made.
  try {
    const raw = localStorage.getItem('sanpo-directions-cache-v2');
    const c = JSON.parse(raw || '{}');
    const e = Object.entries(c);
    out.liveCacheEntries = e.length;
    out.liveCacheChars = raw ? raw.length : 0;
    out.liveKeysSample = e.slice(0, 3).map(([k]) => k.slice(0, 40));
  } catch (err) {
    out.err = String(err);
  }
  // Did the route actually render? (polylines are on the map, so check the
  // visible stop chain + that the app is past init)
  out.stops = [...document.querySelectorAll('li')]
    .map((li) => li.innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  out.header = (() => {
    const h = document.querySelector('.header');
    return h ? h.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) : null;
  })();
  out.visibility = document.visibilityState;
  return out;
})();
