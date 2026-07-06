(async () => {
  if (!window.google || !window.google.maps) return { err: 'no google.maps' };
  const svc = new google.maps.DirectionsService();
  const legs = [
    ['アパリ→ラオアグ', { lat: 18.3547, lng: 121.6411 }, { lat: 18.1969, lng: 120.5936 }],
    ['ラオアグ→ビガン', { lat: 18.1969, lng: 120.5936 }, { lat: 17.5747, lng: 120.3869 }],
    ['ビガン→サンフェルナンド', { lat: 17.5747, lng: 120.3869 }, { lat: 16.6159, lng: 120.3209 }],
    ['サンフェルナンド→ダグパン', { lat: 16.6159, lng: 120.3209 }, { lat: 16.0433, lng: 120.3333 }],
    ['ダグパン→マニラ', { lat: 16.0433, lng: 120.3333 }, { lat: 14.5995, lng: 120.9842 }],
    ['マニラ→ルセナ', { lat: 14.5995, lng: 120.9842 }, { lat: 13.9373, lng: 121.6149 }],
    ['ルセナ→ナガ', { lat: 13.9373, lng: 121.6149 }, { lat: 13.6218, lng: 123.1948 }],
    ['ナガ→レガスピ', { lat: 13.6218, lng: 123.1948 }, { lat: 13.1391, lng: 123.7438 }],
    ['カガヤン→ダバオ', { lat: 8.4822, lng: 124.6472 }, { lat: 7.1907, lng: 125.4553 }],
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const route = (o, d) =>
    new Promise((res) => {
      svc.route(
        { origin: o, destination: d, travelMode: google.maps.TravelMode.DRIVING },
        (r, s) => { let km = null; try { km = r.routes[0].legs[0].distance.value; } catch {} res({ s: String(s), km }); },
      );
    });
  const out = [];
  for (const [n, o, d] of legs) {
    const r = await route(o, d);
    out.push(`${n}: ${r.s}${r.km != null ? ' ' + (r.km / 1000).toFixed(0) + 'km' : ''}`);
    await sleep(450);
  }
  return out;
})();
