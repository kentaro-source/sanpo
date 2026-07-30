/// <reference types="google.maps" />
/**
 * Google's encoded-polyline codec (precision 5, ~1.1 m).
 *
 * Why: route geometry stored as `[{lat,lng},…]` JSON costs ~33 chars per
 * point; encoded costs ~3.9 — measured 8.28× smaller on real Directions
 * output, with a 0.00 m round-trip error (scripts/_encodetest.mjs). That
 * is what makes shipping the whole world's road geometry as static data
 * practical instead of fetching it from Directions at runtime.
 *
 * Implemented locally rather than via google.maps.geometry so it works in
 * Node (the generator) and without loading the geometry library.
 */

export function encodePath(pts: google.maps.LatLngLiteral[]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number): string => {
    let val = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (val >= 0x20) {
      s += String.fromCharCode((0x20 | (val & 0x1f)) + 63);
      val >>= 5;
    }
    return s + String.fromCharCode(val + 63);
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

export function decodePath(str: string): google.maps.LatLngLiteral[] {
  const pts: google.maps.LatLngLiteral[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    let shift = 0;
    let result = 0;
    let b: number;
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
