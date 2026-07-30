// Measure encoded-polyline vs JSON size on REAL Google road geometry,
// and verify the encoder round-trips within tolerance.
// Input: scripts/_polys.json (captured from DirectionsService on 2026-07-07).
import { readFileSync } from 'node:fs';

/** Google's polyline algorithm (precision 5 = ~1.1 m). */
function encodePath(pts) {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v) => {
    let val = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (val >= 0x20) {
      s += String.fromCharCode((0x20 | (val & 0x1f)) + 63);
      val >>= 5;
    }
    s += String.fromCharCode(val + 63);
    return s;
  };
  for (const p of pts) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

function decodePath(str) {
  const pts = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    let shift = 0;
    let result = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

const raw = JSON.parse(readFileSync('scripts/_polys.json', 'utf8'));
const paths = ['shenzhenHK', 'hkMacau', 'macauZhuhai']
  .filter((k) => Array.isArray(raw[k]))
  .map((k) => ({ name: k, pts: raw[k].map(([lat, lng]) => ({ lat, lng })) }));

let totPts = 0;
let totJson = 0;
let totEnc = 0;
let worstErrM = 0;

for (const { name, pts } of paths) {
  // Exactly how the app stores it today: array of {lat,lng} at 5 decimals.
  const rounded = pts.map((p) => ({
    lat: Math.round(p.lat * 1e5) / 1e5,
    lng: Math.round(p.lng * 1e5) / 1e5,
  }));
  const jsonChars = JSON.stringify(rounded).length;
  const encoded = encodePath(rounded);
  const back = decodePath(encoded);

  // Round-trip error in metres (1e-5 deg lat ≈ 1.11 m).
  let maxErr = 0;
  if (back.length !== rounded.length) maxErr = Infinity;
  else {
    for (let i = 0; i < back.length; i++) {
      const dLat = Math.abs(back[i].lat - rounded[i].lat) * 111320;
      const dLng =
        Math.abs(back[i].lng - rounded[i].lng) *
        111320 *
        Math.cos((rounded[i].lat * Math.PI) / 180);
      maxErr = Math.max(maxErr, Math.hypot(dLat, dLng));
    }
  }
  worstErrM = Math.max(worstErrM, maxErr);
  totPts += rounded.length;
  totJson += jsonChars;
  totEnc += encoded.length;

  console.log(
    `${name}: ${rounded.length} pts | JSON ${jsonChars} ch (${(jsonChars / rounded.length).toFixed(1)}/pt) | encoded ${encoded.length} ch (${(encoded.length / rounded.length).toFixed(1)}/pt) | roundtrip max err ${maxErr.toFixed(2)} m`,
  );
}

const ratio = totJson / totEnc;
console.log('---');
console.log(
  JSON.stringify(
    {
      points: totPts,
      jsonChars: totJson,
      encodedChars: totEnc,
      compression: Number(ratio.toFixed(2)),
      charsPerPointEncoded: Number((totEnc / totPts).toFixed(2)),
      worstRoundTripMetres: Number(worstErrM.toFixed(3)),
    },
    null,
    2,
  ),
);

// Extrapolate to the whole route using the measured dev-cache figure:
// 1.93M JSON chars for the 9-segment window around km 0.
const WINDOW_JSON_CHARS = 1_925_418;
const TOTAL_KM = 369_083;
// The km-0 window spans segments JP→KR … PH→BN (measured stop chain), a
// large but partial slice; extrapolate by JSON chars → encoded chars only.
console.log(
  JSON.stringify(
    {
      windowJsonChars: WINDOW_JSON_CHARS,
      windowEncodedCharsEst: Math.round(WINDOW_JSON_CHARS / ratio),
      note: 'per-segment files; whole-world total measured during the real generation run',
      totalKm: TOTAL_KM,
    },
    null,
    2,
  ),
);
