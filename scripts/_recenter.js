(() => {
  const b = document.querySelector('button.map-recenter');
  if (b) { b.click(); return 'clicked recenter'; }
  return 'no recenter button';
})();
