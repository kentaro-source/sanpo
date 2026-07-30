/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { cities, segmentClassifications } from '../../data';
import { getRoadPolyline } from '../../services/directions';
import { getManualLegPath } from '../../data/manualLegPaths';
import { chunkRanges, seaSetFor } from '../../services/routeChunks';
import { preloadSegmentGeometry } from '../../services/routeGeometry';
import { isRealLifeVisitedCapital } from '../../data/realLifeVisited';
import { setBuiltPath, setStopKm } from '../../services/playerPath';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/**
 * Continuous projection of `target` onto the polyline: the closest point on
 * the nearest EDGE (segment), not the nearest vertex. Returns a FRACTIONAL
 * index (i + t, 0≤t≤1) plus the interpolated lat/lng.
 *
 * Why not nearest-vertex: RDP simplification drops near-collinear points, so
 * a straight road leg can collapse to two far-apart vertices. Snapping the
 * marker to the nearest VERTEX then froze it on one endpoint until the
 * player crossed the leg's midpoint — on a long straight stretch that's
 * thousands of ×1 steps with NO visible motion ("歩数は増えるのに動かない").
 * Projecting onto the edge advances the marker smoothly, ~1 m per step.
 * Still uses the raw-geometry `target` (same anti-overshoot behaviour as
 * before) — only the snap granularity changes from vertex to edge.
 */
function projectOntoPath(
  pts: google.maps.LatLngLiteral[],
  target: google.maps.LatLngLiteral,
): { idx: number; lat: number; lng: number } {
  let bestD = Infinity;
  let bestIdx = 0;
  let bestLat = pts[0].lat;
  let bestLng = pts[0].lng;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i].lat;
    const ay = pts[i].lng;
    const dx = pts[i + 1].lat - ax;
    const dy = pts[i + 1].lng - ay;
    const lenSq = dx * dx + dy * dy;
    let t =
      lenSq > 0
        ? ((target.lat - ax) * dx + (target.lng - ay) * dy) / lenSq
        : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const ddx = target.lat - px;
    const ddy = target.lng - py;
    const d = ddx * ddx + ddy * ddy;
    if (d < bestD) {
      bestD = d;
      bestIdx = i + t;
      bestLat = px;
      bestLng = py;
    }
  }
  return { idx: bestIdx, lat: bestLat, lng: bestLng };
}

/**
 * Place the player on the BUILT (real-road) path by ARC LENGTH, anchored to
 * EVERY stop (capitals + waypoint cities), not just capitals. `anchors` is the
 * full route stop list sorted by raw km. Find the two adjacent stops bracketing
 * distanceKm, then map the raw fraction between them onto the real-road arc
 * between their points on the path → a fractional index + lat/lng.
 *
 * Per-CAPITAL anchoring was wrong: one capital→capital leg (China is a single
 * ~12,000km leg with dozens of cities) made the linear km→arc mapping drift
 * tens of km off the actual city positions, so the marker sat far from a city
 * even as that city's 立ち寄り bonus fired (crossing detection keys off each
 * city's km directly). Anchoring on every stop makes the marker reach each city
 * exactly when its km is reached, matching the bonus/crossing logic. Returns
 * null when the bracketing stops aren't on the current built window (caller
 * falls back to projecting `position`).
 */
function markerOnBuiltPath(
  built: { allPoints: google.maps.LatLngLiteral[]; cumKm: number[] },
  distanceKm: number,
  anchors: { km: number; lat: number; lng: number }[],
): { idx: number; lat: number; lng: number } | null {
  const { allPoints, cumKm } = built;
  const n = anchors.length;
  if (n < 2 || distanceKm < anchors[0].km || distanceKm > anchors[n - 1].km) {
    return null;
  }
  // Binary search: largest anchor with km <= distanceKm.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].km <= distanceKm) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  if (b.km <= a.km) return null;
  // Nearest path point to an anchor, but ONLY if the path actually passes
  // near it. Without this bound the function silently "matches" an anchor
  // to the far end of a PARTIAL path: during the incremental build the first
  // finished segment was Mongolia→Manila, so the Bali/Lombok anchors both
  // resolved to the Manila end and the map centred on Manila while the
  // player was on Bali. Stops are vertices of the real path, so a genuine
  // match is within a fraction of a degree; 0.5° (~55 km) is a generous
  // bound that still rejects a wrong-continent match.
  const ANCHOR_TOLERANCE_DEG = 0.5;
  const nearest = (lat: number, lng: number): number => {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < allPoints.length; i += 1) {
      const dl = allPoints[i].lat - lat;
      const dg = allPoints[i].lng - lng;
      const d = dl * dl + dg * dg;
      if (d < bd) { bd = d; bi = i; }
    }
    return bd <= ANCHOR_TOLERANCE_DEG * ANCHOR_TOLERANCE_DEG ? bi : -1;
  };
  const ia = nearest(a.lat, a.lng);
  const ib = nearest(b.lat, b.lng);
  if (ia < 0 || ib < 0 || ia >= ib) return null;
  const f = (distanceKm - a.km) / (b.km - a.km);
  const targetArc = cumKm[ia] + f * (cumKm[ib] - cumKm[ia]);
  for (let i = ia + 1; i <= ib; i += 1) {
    if (cumKm[i] >= targetArc) {
      const seg = cumKm[i] - cumKm[i - 1];
      const t = seg > 0 ? Math.max(0, Math.min(1, (targetArc - cumKm[i - 1]) / seg)) : 0;
      return {
        idx: (i - 1) + t,
        lat: allPoints[i - 1].lat + (allPoints[i].lat - allPoints[i - 1].lat) * t,
        lng: allPoints[i - 1].lng + (allPoints[i].lng - allPoints[i - 1].lng) * t,
      };
    }
  }
  const last = allPoints[ib];
  return { idx: ib, lat: last.lat, lng: last.lng };
}

/**
 * Where the player is on the built road path — the single answer used by the
 * marker, the walked/future split, and the initial map centring.
 *
 * The path is assembled segment-by-segment, so early in a build it can cover
 * a completely different part of the world than the player. Anchoring by stop
 * arc length (markerOnBuiltPath) already returns null in that case, but the
 * old `?? projectOntoPath(...)` fallback then snapped to whatever end of the
 * partial path was nearest: with the player on Bali and only Mongolia→Manila
 * built, the marker, the green "walked" line and the map centre all jumped to
 * Manila. Three copies of that fallback existed and all three were wrong, so
 * the decision lives here now.
 *
 * Returns null when neither method can place the player trustworthily; the
 * caller should then use the raw route position, which is never in the wrong
 * part of the world.
 */
function playerOnBuiltPath(
  built: { allPoints: google.maps.LatLngLiteral[]; cumKm: number[] },
  distanceKm: number,
  anchors: { km: number; lat: number; lng: number }[],
  rawPosition: google.maps.LatLngLiteral,
): { idx: number; lat: number; lng: number } | null {
  if (built.allPoints.length < 2) return null;
  const anchored = markerOnBuiltPath(built, distanceKm, anchors);
  if (anchored) return anchored;
  const p = projectOntoPath(built.allPoints, rawPosition);
  const nearRaw =
    Math.abs(p.lat - rawPosition.lat) <= 1 &&
    Math.abs(p.lng - rawPosition.lng) <= 1;
  return nearRaw ? p : null;
}

const TYPE_COLORS: Record<string, string> = {
  metropolis: '#0ea5e9',
  historic: '#a855f7',
  tourist: '#10b981',
  gourmet: '#f59e0b',
};

let scriptLoadingPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject('no window');
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
    return Promise.resolve();
  }
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=quarterly&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

export function MapView() {
  const { player, currentSquare, position, routeData } = useGame();

  // Every route stop (capitals + waypoint cities) sorted by raw km. The marker
  // is anchored to these so it reaches each city exactly when that city's km is
  // hit — matching the 立ち寄り / crossing detection (which keys off the same
  // per-city km). Memoized: only rebuilds if the route changes.
  const stopAnchors = useMemo(() => {
    const list: { km: number; lat: number; lng: number }[] = [];
    for (const cap of routeData.capitals) {
      const km = routeData.capitalDistances[cap.id];
      if (km != null) list.push({ km, lat: cap.lat, lng: cap.lng });
    }
    const wpIds = new Set<string>();
    for (const seg of segmentClassifications) {
      for (const cid of seg.waypointCityIds ?? []) wpIds.add(cid);
    }
    for (const c of cities) {
      if (!wpIds.has(c.id)) continue;
      const km = routeData.cityDistances?.[c.id];
      if (km != null) list.push({ km, lat: c.lat, lng: c.lng });
    }
    list.sort((p, q) => p.km - q.km);
    return list;
  }, [routeData]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const passedPolylineRef = useRef<google.maps.Polyline | null>(null);
  const upcomingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const realRoutePolylinesRef = useRef<google.maps.Polyline[]>([]);
  // Persistent split-polylines: created once, updated via setPath on each
  // step. Without this we'd destroy + recreate every distanceKm change
  // (≥1× per second of walking) and the user would see route flicker.
  const walkedGlowRef = useRef<google.maps.Polyline | null>(null);
  const walkedRef = useRef<google.maps.Polyline | null>(null);
  const futureGlowRef = useRef<google.maps.Polyline | null>(null);
  const futureRef = useRef<google.maps.Polyline | null>(null);
  const builtPathRef = useRef<{
    allPoints: google.maps.LatLngLiteral[];
    cumKm: number[];
  } | null>(null);
  const capitalMarkersRef = useRef<google.maps.Marker[]>([]);
  const cityMarkersRef = useRef<google.maps.Marker[]>([]);
  const squareMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
  // Smooth marker glide: requestAnimationFrame id, the marker's current
  // (float) index along the built road path, and the built-path object
  // identity (to detect a window rebuild and snap instead of gliding
  // across a brand-new points array).
  const markerAnimRef = useRef<number | null>(null);
  const markerIdxRef = useRef<number | null>(null);
  const builtIdentityRef = useRef<unknown>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const initialCenterDoneRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load script
  useEffect(() => {
    if (!API_KEY) {
      setError('API キー未設定');
      return;
    }
    loadGoogleMapsScript(API_KEY)
      .then(() => setLoaded(true))
      .catch((e) => setError(String(e)));
  }, []);

  // Initialize map
  useEffect(() => {
    if (!loaded || !containerRef.current || mapRef.current) return;

    mapRef.current = new google.maps.Map(containerRef.current, {
      // Use the smooth interpolated player position (more accurate than
      // the start-of-square lat/lng), so on launch the map opens exactly
      // where the player is along the route, not snapped to a square edge.
      center: position,
      // Zoom 16 ≈ 2.4m/px. Sized for the v7 distance model where
      // KM_PER_STEP = 0.001 (1m/step). At ×1 walking 1 step ≈ 0.4px
      // — subtle but cumulative. At a stacked ×12 boost 1 step ≈ 5px,
      // clearly perceptible. Tight enough to feel "in the city" without
      // drowning the view in street labels. The user can pinch-zoom.
      zoom: 16,
      zoomControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ],
    });
  }, [loaded]);

  // Note: passed/upcoming square-by-square polylines were dropped for perf.
  // The colored segment-classification polylines (red/blue/purple/orange)
  // already show the route. Progress is shown via the current-position
  // marker and the colored square dots (when zoomed in).
  useEffect(() => {
    passedPolylineRef.current?.setMap(null);
    upcomingPolylineRef.current?.setMap(null);
  }, [loaded]);

  // Render real route polylines from segmentClassifications (Batch N waypoint cities)
  // Uses Directions API for land segments to follow real roads.
  // Polylines are simplified to ~50 points each to keep pan/zoom fast.
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    let cancelled = false;

    // Douglas-Peucker simplification: keeps curve-defining points (high
    // perpendicular distance from the chord) and drops redundant ones in
    // near-straight sections. epsilon is in degrees (~0.02 ≈ 2km).
    type LL = google.maps.LatLngLiteral;
    const perpDist = (p: LL, a: LL, b: LL): number => {
      const dx = b.lat - a.lat;
      const dy = b.lng - a.lng;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) {
        const ddx = p.lat - a.lat;
        const ddy = p.lng - a.lng;
        return Math.sqrt(ddx * ddx + ddy * ddy);
      }
      const t = ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / lenSq;
      const px = a.lat + t * dx;
      const py = a.lng + t * dy;
      const ddx = p.lat - px;
      const ddy = p.lng - py;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    };
    // Iterative Douglas-Peucker. The recursive version blew the call
    // stack ('Maximum call stack size exceeded') on long polylines —
    // worst case recursion depth is O(N) when the geometry approaches
    // a near-straight chain, and Directions paths can hit several
    // thousand points across the visible window.
    const rdp = (pts: LL[], eps: number): LL[] => {
      if (pts.length < 3) return [...pts];
      const keep = new Uint8Array(pts.length);
      keep[0] = 1;
      keep[pts.length - 1] = 1;
      const stack: [number, number][] = [[0, pts.length - 1]];
      while (stack.length > 0) {
        const [start, end] = stack.pop()!;
        if (end - start < 2) continue;
        let maxD = 0;
        let maxI = -1;
        const a = pts[start];
        const b = pts[end];
        for (let i = start + 1; i < end; i++) {
          const d = perpDist(pts[i], a, b);
          if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > eps && maxI > -1) {
          keep[maxI] = 1;
          stack.push([start, maxI]);
          stack.push([maxI, end]);
        }
      }
      const result: LL[] = [];
      for (let i = 0; i < pts.length; i++) {
        if (keep[i]) result.push(pts[i]);
      }
      return result;
    };
    const simplifyPath = (path: LL[]) => {
      if (path.length <= 4) return path;
      // ~10 m tolerance. 0.001° (~100m) was still visible as slight
      // road-misalignment at zoom 17+ — the user noticed '道から微妙に
      // ずれている' on the Tokyo Station view. 0.0001° keeps the
      // polyline pixel-aligned with road geometry at street level
      // while still trimming redundant near-collinear points.
      return rdp(path, 0.0001);
    };

    // Clear existing
    realRoutePolylinesRef.current.forEach((p) => p.setMap(null));
    realRoutePolylinesRef.current = [];

    // Render only segments near the current position. The full world
    // tour polyline (1500+ points) is too heavy on mobile, but the player
    // doesn't need to see segments halfway across the planet right now.
    // Show segments around the current position. Clip (do NOT wrap):
    // wrapping caused the Tokyo→Middle East ghost line because only 46/193
    // segments are classified, so "3 behind segment 0" pulled in the last
    // classified ones from the Middle East.
    const SEGMENTS_BEHIND = 3;
    const SEGMENTS_AHEAD = 5;
    const totalSegs = segmentClassifications.length;
    const currentSegIdx = currentSquare.segmentIndex;
    const startIdx = Math.max(0, currentSegIdx - SEGMENTS_BEHIND);
    const endIdx = Math.min(totalSegs - 1, currentSegIdx + SEGMENTS_AHEAD);
    const visibleSegs: typeof segmentClassifications = [];
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const seg = segmentClassifications[idx];
      if (seg) visibleSegs.push(seg);
    }

    // Helper: distance between two latlng in km (haversine).
    const kmBetween = (a: LL, b: LL): number => {
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    type Built = {
      allPoints: google.maps.LatLngLiteral[];
      cumKm: number[];
    };

    // Materialize walked + future polylines from a Built path. Reuses
    // the persistent refs (walkedRef etc.) so distanceKm changes update
    // setPath instead of destroy+recreate. Without this every step
    // produced visible route flicker (user: '頻繁に更新されるのは不快').
    const renderFromBuilt = (b: Built) => {
      if (!mapRef.current) return;

      // Split walked/future at the continuous projection of the player's
      // position onto the road, so the green/blue boundary sits exactly
      // under the (also-continuous) marker instead of snapping to a vertex.
      // If the player can't be placed on this (possibly partial) path yet,
      // draw it all as "future" rather than mis-colouring a whole continent
      // as walked.
      const proj = playerOnBuiltPath(b, player.distanceKm, stopAnchors, position);
      let walkedPath: google.maps.LatLngLiteral[] = [];
      let futurePath: google.maps.LatLngLiteral[] = [];
      if (!proj) {
        // Player not placeable on this (partial) path yet — show it all as
        // future rather than colouring another continent as already walked.
        futurePath = b.allPoints;
      } else {
        const splitIdx = Math.floor(proj.idx);
        const splitPoint = { lat: proj.lat, lng: proj.lng };
        if (proj.idx <= 0) {
          futurePath = b.allPoints;
        } else if (splitIdx >= b.allPoints.length - 1) {
          walkedPath = b.allPoints;
        } else {
          walkedPath = [...b.allPoints.slice(0, splitIdx + 1), splitPoint];
          futurePath = [splitPoint, ...b.allPoints.slice(splitIdx + 1)];
        }
      }

      const ensureWalked = (path: google.maps.LatLngLiteral[]) => {
        if (path.length < 2) {
          walkedGlowRef.current?.setMap(null);
          walkedGlowRef.current = null;
          walkedRef.current?.setMap(null);
          walkedRef.current = null;
          return;
        }
        if (walkedGlowRef.current) {
          walkedGlowRef.current.setPath(path);
        } else {
          walkedGlowRef.current = new google.maps.Polyline({
            path,
            strokeColor: '#ffffff',
            strokeOpacity: 0.85,
            strokeWeight: 8,
            zIndex: 5,
            geodesic: true,
            map: mapRef.current!,
          });
        }
        if (walkedRef.current) {
          walkedRef.current.setPath(path);
        } else {
          walkedRef.current = new google.maps.Polyline({
            path,
            strokeColor: '#10b981',
            strokeOpacity: 0.98,
            strokeWeight: 5,
            zIndex: 6,
            geodesic: true,
            map: mapRef.current!,
          });
        }
      };

      const ensureFuture = (path: google.maps.LatLngLiteral[]) => {
        if (path.length < 2) {
          futureGlowRef.current?.setMap(null);
          futureGlowRef.current = null;
          futureRef.current?.setMap(null);
          futureRef.current = null;
          return;
        }
        if (futureGlowRef.current) {
          futureGlowRef.current.setPath(path);
        } else {
          futureGlowRef.current = new google.maps.Polyline({
            path,
            strokeColor: '#ffffff',
            strokeOpacity: 0.85,
            strokeWeight: 8,
            zIndex: 4,
            geodesic: true,
            map: mapRef.current!,
          });
        }
        if (futureRef.current) {
          futureRef.current.setPath(path);
        } else {
          futureRef.current = new google.maps.Polyline({
            path,
            strokeColor: '#2563eb',
            strokeOpacity: 0.95,
            strokeWeight: 5,
            zIndex: 5,
            geodesic: true,
            map: mapRef.current!,
          });
        }
      };

      ensureWalked(walkedPath);
      ensureFuture(futurePath);
    };

    async function renderCombinedRoute() {
      // The first visible segment's starting km — needed to align
      // cumKm with player.distanceKm.
      const firstSeg = visibleSegs[0];
      const firstSegStartKm = firstSeg
        ? routeData.capitalDistances[firstSeg.fromCapitalId] ?? 0
        : 0;

      // The Phase-1 straight-line preview was reverted — it drew an
      // ugly Tokyo→Miyazaki diagonal across the Pacific while waiting
      // for Directions API. Better to show nothing for a few seconds
      // than a misleading straight line. The Directions cache (30-day
      // TTL in localStorage) makes subsequent loads instant anyway.

      const allPoints: google.maps.LatLngLiteral[] = [];
      const cumKm: number[] = [];
      let runningKm = firstSegStartKm;

      const nearestIdxIn = (lat: number, lng: number): number => {
        let bestIdx = -1;
        let bestD = Infinity;
        for (let i = 0; i < allPoints.length; i++) {
          const p = allPoints[i];
          const dLat = p.lat - lat;
          const dLng = p.lng - lng;
          const d = dLat * dLat + dLng * dLng;
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        return bestIdx;
      };

      // Progressive publish: as soon as a segment's geometry is in,
      // expose the partial polyline + its stops' snap-km overrides and
      // draw the line. Previously everything was held back until ALL
      // ~9 window segments finished fetching — one slow segment
      // (uncached pairs, NK failures) kept the whole map blank for up
      // to a minute.
      const publishSegment = (seg: (typeof visibleSegs)[number]) => {
        const snapshot = {
          allPoints: allPoints.slice(),
          cumKm: cumKm.slice(),
        };
        builtPathRef.current = snapshot;
        setBuiltPath(snapshot);
        for (const id of [seg.fromCapitalId, seg.toCapitalId]) {
          const cap = routeData.capitals.find((c) => c.id === id);
          if (!cap) continue;
          const idx = nearestIdxIn(cap.lat, cap.lng);
          if (idx >= 0) setStopKm('capital', id, cumKm[idx]);
        }
        for (const cityId of seg.waypointCityIds ?? []) {
          const city = cities.find((c) => c.id === cityId);
          if (!city) continue;
          const idx = nearestIdxIn(city.lat, city.lng);
          if (idx >= 0) setStopKm('city', cityId, cumKm[idx]);
        }
        renderFromBuilt(snapshot);
        // Pan to the player as soon as the partial path reaches them.
        //
        // This used to compare player.distanceKm (GLOBAL route km, e.g.
        // 29,508) against this window's cumKm — which is arc length starting
        // at 0 for the built window. Two different scales: the range check
        // failed, so no pan ever happened and the map sat on its default
        // center (open ocean) until the user pressed 📍. Same dual-scale
        // class of bug that caused the old marker/stop mismatches.
        //
        // Now it uses markerOnBuiltPath — the exact same all-stop arc-length
        // anchoring the player marker uses — so the map centers on precisely
        // where the marker is. It returns null until the stops bracketing the
        // player are in the built window, which also gives us the "wait until
        // the path covers the player" behaviour for free.
        if (!initialCenterDoneRef.current && mapRef.current) {
          const proj = markerOnBuiltPath(snapshot, player.distanceKm, stopAnchors);
          if (proj) {
            mapRef.current.panTo({ lat: proj.lat, lng: proj.lng });
            initialCenterDoneRef.current = true;
          }
        }
      };

      for (const seg of visibleSegs) {
        if (cancelled) return;
        const fromCap = routeData.capitals.find((c) => c.id === seg.fromCapitalId);
        const toCap = routeData.capitals.find((c) => c.id === seg.toCapitalId);
        if (!fromCap || !toCap) continue;

        const origin = { lat: fromCap.lat, lng: fromCap.lng };
        const destination = { lat: toCap.lat, lng: toCap.lng };
        const waypoints: google.maps.LatLngLiteral[] = [];
        for (const cityId of seg.waypointCityIds ?? []) {
          const city = cities.find((c) => c.id === cityId);
          if (city) waypoints.push({ lat: city.lat, lng: city.lng });
        }

        let segPath: google.maps.LatLngLiteral[];

        if (seg.routeType === 'land' || seg.routeType === 'mixed') {
          // Chunk consecutive non-sea points into Directions calls of
          // ≤23 waypoints each (the API caps a request at ~25 stops).
          // The old code passed ALL waypoints in one call (land) — which
          // silently fails once a densified segment exceeds 25 stops — or
          // fired one call PER PAIR (mixed), which for a 52-waypoint
          // segment meant ~51 serial round-trips that never finished
          // rendering (→ straight-line fallback the whole time). Chunking
          // cuts that to ~2-3 calls per segment: roads render, fast.
          const points = [origin, ...waypoints, destination];
          const seaSet = seaSetFor(seg);
          // Pre-generated geometry for this segment (if shipped) — makes the
          // getRoadPolyline calls below cache hits instead of API requests.
          await preloadSegmentGeometry(seg.fromCapitalId, seg.toCapitalId);
          if (cancelled) return;
          const built: google.maps.LatLngLiteral[] = [];
          for (const range of chunkRanges(points.length, seaSet)) {
            const i = range.i;
            if (cancelled) return;
            if (range.kind === 'sea') {
              // Sea/ferry/border leg → straight line, UNLESS we have a
              // hand-traced real route. The HK/Macau SAR crossings all return
              // ZERO_RESULTS from Directions (verified on-device), so they're
              // flagged sea to break the chunk cleanly — but they DO have real
              // bridges/roads (深圳湾大橋, 港珠澳大橋, 拱北口岸). Draw those.
              if (built.length === 0) built.push(points[i]);
              const manual = getManualLegPath(points[i], points[i + 1]);
              if (manual) {
                for (const p of manual) built.push(p);
              }
              built.push(points[i + 1]);
              continue;
            }
            // Road run: ≤24 legs (= ≤23 intermediate waypoints + origin +
            // dest = ≤25 stops) per Directions call. Boundaries come from the
            // shared chunkRanges so the offline generator produces identical
            // cache keys.
            const j = range.j;
            const road = await getRoadPolyline(
              points[i],
              points[j],
              points.slice(i + 1, j),
            );
            if (cancelled) return;
            let pathSeg: google.maps.LatLngLiteral[];
            if (road) {
              pathSeg = road;
            } else {
              // The whole batch returned ZERO_RESULTS. Usually ONE leg is
              // unroutable (香港→マカオ across water, a cross-border leg
              // Google refuses, …) and it poisons the entire multi-city
              // batch — straight-lining a dozen otherwise-routable China
              // legs (this is what made 南京→…→深圳 render as one diagonal).
              // Retry leg-by-leg so only the genuinely-bad leg degrades to a
              // straight line; every other leg still follows real roads.
              pathSeg = [points[i]];
              for (let k = i; k < j; k++) {
                if (cancelled) return;
                const legRoad = await getRoadPolyline(points[k], points[k + 1]);
                if (cancelled) return;
                if (legRoad && legRoad.length > 1) {
                  for (let p = 1; p < legRoad.length; p++) pathSeg.push(legRoad[p]);
                } else {
                  pathSeg.push(points[k + 1]);
                }
              }
            }
            // Spread-push blows the V8 arg limit (~65k) on long paths.
            const start = built.length === 0 ? 0 : 1;
            for (let k = start; k < pathSeg.length; k++) {
              built.push(pathSeg[k]);
            }
          }
          segPath = simplifyPath(built);
        } else {
          // sea / fantasy: straight lines through waypoints
          segPath = [origin, ...waypoints, destination];
        }

        // Append to combined path, skipping duplicate boundary point
        const startIdxAdd = allPoints.length === 0 ? 0 : 1;
        for (let i = startIdxAdd; i < segPath.length; i++) {
          const p = segPath[i];
          if (allPoints.length > 0) {
            runningKm += kmBetween(allPoints[allPoints.length - 1], p);
          }
          allPoints.push(p);
          cumKm.push(runningKm);
        }

        publishSegment(seg);
      }

      if (cancelled || !mapRef.current) return;

      // Cache the built geometry so the cheap walked/future split effect
      // can re-render on each step without rebuilding from Directions.
      builtPathRef.current = { allPoints, cumKm };
      // Share with non-map consumers (ShareToX, geocoding) so they can
      // resolve player position to actual road lat/lng instead of the
      // squares-coarse interpolation that drifts off-route.
      setBuiltPath({ allPoints, cumKm });

      // Push snap-cumulative km for each capital/city in this window
      // into playerPath overrides, so upcomingStops / ShareToX
      // compute "next stop" against the same km axis as the rendered
      // polyline. Fixes the "湖西市にいるのに浜松はこれから" desync.
      // Final full-window pass — re-pushes each stop's km against the
      // COMPLETE path (a stop near a window boundary can snap to a
      // better polyline point once the neighbour segment exists).
      // setStopKm no-ops on unchanged values, so this is cheap.
      const findNearestIdx = nearestIdxIn;
      for (const seg of visibleSegs) {
        for (const id of [seg.fromCapitalId, seg.toCapitalId]) {
          const cap = routeData.capitals.find((c) => c.id === id);
          if (!cap) continue;
          const idx = findNearestIdx(cap.lat, cap.lng);
          if (idx >= 0) setStopKm('capital', id, cumKm[idx]);
        }
        for (const cityId of seg.waypointCityIds ?? []) {
          const city = cities.find((c) => c.id === cityId);
          if (!city) continue;
          const idx = findNearestIdx(city.lat, city.lng);
          if (idx >= 0) setStopKm('city', cityId, cumKm[idx]);
        }
      }

      renderFromBuilt(builtPathRef.current);

      // First-render center alignment: now that the polyline is built we
      // know the actual road position for the player's km.
      //
      // This was a SECOND copy of the partial-build centering above, with the
      // same dual-scale bug: player.distanceKm is global route km (29,508)
      // while cumKm is arc length from the start of the built WINDOW (0-based).
      // Searching one with the other centred the map on Manila while the
      // player was on Bali. Both call sites now use markerOnBuiltPath, i.e.
      // exactly where the player marker is drawn.
      if (!initialCenterDoneRef.current && mapRef.current) {
        const proj = markerOnBuiltPath(
          { allPoints, cumKm },
          player.distanceKm,
          stopAnchors,
        );
        if (proj) {
          mapRef.current.panTo({ lat: proj.lat, lng: proj.lng });
          initialCenterDoneRef.current = true;
        }
      }
    }

    renderCombinedRoute().catch((e) => {
      console.error('Combined route polyline error:', e);
    });

    return () => {
      cancelled = true;
    };
    // Heavy effect: ONLY rebuild Directions geometry when crossing into a
    // new segment. Was previously also keyed on player.distanceKm, which
    // meant every single step (1m advance) cancelled the in-flight
    // Directions promises and started over — so the route never finished
    // rendering while the user was walking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, currentSquare.segmentIndex]);

  // Cheap effect: re-split the cached geometry into walked/future
  // polylines when the player's distanceKm changes (every step). Reads
  // from builtPathRef populated by the heavy effect above. Inlined
  // (duplicated) split logic so this effect doesn't depend on closures
  // captured inside the heavy effect.
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const b = builtPathRef.current;
    if (!b) return;

    realRoutePolylinesRef.current.forEach((p) => p.setMap(null));
    realRoutePolylinesRef.current = [];

    const proj = playerOnBuiltPath(b, player.distanceKm, stopAnchors, position);
    let walkedPath: google.maps.LatLngLiteral[] = [];
    let futurePath: google.maps.LatLngLiteral[] = [];
    if (!proj) {
      futurePath = b.allPoints;
    } else {
      const splitIdx = Math.floor(proj.idx);
      const splitPoint = { lat: proj.lat, lng: proj.lng };
      if (proj.idx <= 0) {
        futurePath = b.allPoints;
      } else if (splitIdx >= b.allPoints.length - 1) {
        walkedPath = b.allPoints;
      } else {
        walkedPath = [...b.allPoints.slice(0, splitIdx + 1), splitPoint];
        futurePath = [splitPoint, ...b.allPoints.slice(splitIdx + 1)];
      }
    }

    if (walkedPath.length >= 2) {
      realRoutePolylinesRef.current.push(
        new google.maps.Polyline({
          path: walkedPath,
          strokeColor: '#10b981',
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 6,
          geodesic: true,
          map: mapRef.current,
        }),
      );
    }
    if (futurePath.length >= 2) {
      realRoutePolylinesRef.current.push(
        new google.maps.Polyline({
          path: futurePath,
          strokeColor: '#64748b',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          zIndex: 5,
          geodesic: true,
          map: mapRef.current,
        }),
      );
    }
  }, [loaded, player.distanceKm]);

  // Render capital markers — only those near the current position to keep
  // marker count tiny. Re-renders when player advances.
  useEffect(() => {
    if (!mapRef.current || !loaded) return;

    capitalMarkersRef.current.forEach((m) => m.setMap(null));
    capitalMarkersRef.current = [];

    // Pick: previous N capitals (passed) + next M capitals (upcoming).
    // Find current capital index via the current square's segment.
    const currentSegIdx = currentSquare.segmentIndex;
    const PASSED_BEHIND = 3;
    const UPCOMING_AHEAD = 5;
    const totalCaps = routeData.capitals.length;

    const visibleIndices = new Set<number>();
    for (let i = -PASSED_BEHIND; i <= UPCOMING_AHEAD; i++) {
      const idx = (currentSegIdx + i + totalCaps) % totalCaps;
      visibleIndices.add(idx);
    }

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 280 });
    }
    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;'
          : c === '<' ? '&lt;'
          : c === '>' ? '&gt;'
          : c === '"' ? '&quot;'
          : '&#39;'
      );

    for (let i = 0; i < routeData.capitals.length; i++) {
      if (!visibleIndices.has(i)) continue;
      const capital = routeData.capitals[i];
      const visited = player.visitedCapitals.includes(capital.id);
      const m = new google.maps.Marker({
        position: { lat: capital.lat, lng: capital.lng },
        map: mapRef.current,
        title: `${capital.nameJa} (${capital.countryJa})`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: visited ? 6 : 4,
          fillColor: visited ? '#10b981' : '#cbd5e1',
          fillOpacity: 0.9,
          strokeColor: visited ? '#059669' : '#64748b',
          strokeWeight: 1.5,
        },
      });
      const irlCapital = isRealLifeVisitedCapital(capital.id);
      m.addListener('click', () => {
        const visitedTag = visited
          ? '<span style="color:#10b981;font-weight:600">✓ 通過済</span>'
          : '<span style="color:#94a3b8">未通過</span>';
        const irlTag = irlCapital
          ? '<div style="margin-top:4px;color:#ec4899;font-weight:600">★ 思い出の首都</div>'
          : '';
        const html =
          `<div style="font-size:13px;line-height:1.5">` +
          `<div style="font-weight:700;font-size:14px">🏛 ${escapeHtml(capital.nameJa)}</div>` +
          `<div style="color:#64748b;font-size:11px;margin-top:2px">${escapeHtml(capital.countryJa)} / ${escapeHtml(capital.country)} 首都</div>` +
          `<div style="margin-top:6px">${visitedTag}</div>` +
          irlTag +
          `</div>`;
        infoWindowRef.current!.setContent(html);
        infoWindowRef.current!.open({ map: mapRef.current!, anchor: m });
      });
      capitalMarkersRef.current.push(m);
    }
  }, [loaded, player.visitedCapitals, currentSquare.segmentIndex]);

  // City markers: only those used as waypoints on the currently visible
  // 9-segment window around the player. Previously created ALL ~200
  // city markers at once, which was getting heavy as the city count
  // grew (user: 'マーカー置きすぎたら地図が重くならない？').
  useEffect(() => {
    if (!mapRef.current || !loaded) return;

    cityMarkersRef.current.forEach((m) => m.setMap(null));
    cityMarkersRef.current = [];

    const SEGMENTS_BEHIND = 3;
    const SEGMENTS_AHEAD = 5;
    const totalSegs = segmentClassifications.length;
    const currentSegIdx = currentSquare.segmentIndex;
    const startIdx = Math.max(0, currentSegIdx - SEGMENTS_BEHIND);
    const endIdx = Math.min(totalSegs - 1, currentSegIdx + SEGMENTS_AHEAD);
    const wantIds = new Set<string>();
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const seg = segmentClassifications[idx];
      for (const cid of seg?.waypointCityIds ?? []) wantIds.add(cid);
    }
    const wanted = cities.filter((c) => wantIds.has(c.id));

    const ensureCreated = () => {
      if (cityMarkersRef.current.length > 0) return;
      const escapeHtml = (s: string) =>
        s.replace(/[&<>"']/g, (c) =>
          c === '&' ? '&amp;'
            : c === '<' ? '&lt;'
            : c === '>' ? '&gt;'
            : c === '"' ? '&quot;'
            : '&#39;'
        );
      for (const city of wanted) {
        const color = TYPE_COLORS[city.type] ?? '#6b7280';
        const m = new google.maps.Marker({
          position: { lat: city.lat, lng: city.lng },
          map: mapRef.current,
          title: `${city.nameJa} (${city.countryJa})`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 3,
            fillColor: color,
            fillOpacity: 0.7,
            strokeColor: 'white',
            strokeWeight: 0.8,
          },
        });
        m.addListener('click', () => {
          if (!infoWindowRef.current) {
            infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 280 });
          }
          const irlTag = city.visitedInRealLife
            ? '<span style="color:#ec4899;font-weight:600">★ 実生活で訪問済</span>'
            : '';
          const html =
            `<div style="font-size:13px;line-height:1.5">` +
            `<div style="font-weight:700;font-size:14px">📍 ${escapeHtml(city.nameJa)}</div>` +
            `<div style="color:#64748b;font-size:11px;margin-top:2px">${escapeHtml(city.countryJa)} / ${escapeHtml(city.name)}</div>` +
            (city.description
              ? `<div style="margin-top:6px;color:#334155">${escapeHtml(city.description)}</div>`
              : '') +
            (irlTag ? `<div style="margin-top:6px">${irlTag}</div>` : '') +
            `</div>`;
          infoWindowRef.current.setContent(html);
          infoWindowRef.current.open({ map: mapRef.current!, anchor: m });
        });
        cityMarkersRef.current.push(m);
      }
    };

    const updateCityVisibility = () => {
      const zoom = mapRef.current?.getZoom() ?? 4;
      const shouldShow = zoom >= 7;
      if (shouldShow && cityMarkersRef.current.length === 0) ensureCreated();
      for (const m of cityMarkersRef.current) m.setVisible(shouldShow);
    };
    const listener = mapRef.current.addListener(
      'zoom_changed',
      updateCityVisibility,
    );
    updateCityVisibility();

    return () => {
      google.maps.event.removeListener(listener);
      cityMarkersRef.current.forEach((m) => m.setMap(null));
      cityMarkersRef.current = [];
    };
  }, [loaded, currentSquare.segmentIndex]);

  // Square dots: lazy-create only when zoomed close enough to actually see them.
  // Sampling 1/40 keeps the dot-marker count ~constant now that squares are
  // ~7× denser (~20km spacing) than the old 150km/40-cap model.
  const SQUARE_SAMPLE = 40;
  const SQUARE_MIN_ZOOM = 8; // higher threshold — only at street-level views

  useEffect(() => {
    if (!loaded || !mapRef.current) return;

    let created = false;
    const ensureCreated = () => {
      if (created) return;
      created = true;
      for (let i = 0; i < routeData.squares.length; i++) {
        const sq = routeData.squares[i];
        if (sq.isCapital) continue;
        if (i % SQUARE_SAMPLE !== 0) continue;
        const m = new google.maps.Marker({
          position: { lat: sq.lat, lng: sq.lng },
          map: mapRef.current,
          clickable: false,
          zIndex: 2,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 2,
            fillColor: '#cbd5e1',
            fillOpacity: 0.85,
            strokeColor: '#475569',
            strokeWeight: 0.5,
          },
        });
        (m as unknown as { _idx: number })._idx = i;
        squareMarkersRef.current.push(m);
      }
      // Initial color paint for current position
      paintSquareDots(player.currentSquareIndex);
    };

    const updateVisibility = () => {
      const zoom = mapRef.current?.getZoom() ?? 4;
      const shouldShow = zoom >= SQUARE_MIN_ZOOM;
      if (shouldShow && !created) ensureCreated();
      for (const m of squareMarkersRef.current) m.setVisible(shouldShow);
    };
    mapRef.current.addListener('zoom_changed', updateVisibility);
    updateVisibility();

    return () => {
      squareMarkersRef.current.forEach((m) => m.setMap(null));
      squareMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, routeData]);

  // Helper: repaint square dots based on current position
  const paintSquareDots = (currentIdx: number) => {
    if (squareMarkersRef.current.length === 0) return;
    const passedIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 4,
      fillColor: '#16a34a',
      fillOpacity: 1,
      strokeColor: '#14532d',
      strokeWeight: 1.5,
    };
    const upcomingIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 2,
      fillColor: '#cbd5e1',
      fillOpacity: 0.85,
      strokeColor: '#475569',
      strokeWeight: 0.5,
    };
    for (const m of squareMarkersRef.current) {
      const i = (m as unknown as { _idx: number })._idx;
      m.setIcon(i <= currentIdx ? passedIcon : upcomingIcon);
    }
  };

  // Repaint square dots when player position changes.
  useEffect(() => {
    if (!loaded) return;
    paintSquareDots(player.currentSquareIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.currentSquareIndex, loaded]);

  // Render / move current position marker — projected onto the actual
  // road polyline (built async from Directions API) when available, so
  // the marker stays glued to the route line. Falls back to the great-
  // circle position from useGame if the polyline hasn't built yet.
  useEffect(() => {
    if (!mapRef.current) return;

    const built = builtPathRef.current;
    // Target: continuous projection of the raw-geometry position onto the
    // rendered road (edge projection, not nearest vertex), so the marker
    // advances smoothly even on RDP-sparsened straight legs.
    let targetPos: google.maps.LatLngLiteral = position;
    let targetIdx = -1;
    if (built && built.allPoints.length > 1) {
      const proj = playerOnBuiltPath(built, player.distanceKm, stopAnchors, position);
      if (proj) {
        targetIdx = proj.idx;
        targetPos = { lat: proj.lat, lng: proj.lng };
      }
      // else: keep the raw route position — never the wrong continent.
    }

    // First run: create the marker, no glide.
    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new google.maps.Marker({
        position: targetPos,
        map: mapRef.current,
        zIndex: 1000,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });
      markerIdxRef.current = targetIdx >= 0 ? targetIdx : null;
      builtIdentityRef.current = built;
      if (!initialCenterDoneRef.current && built) {
        mapRef.current.panTo(targetPos);
        initialCenterDoneRef.current = true;
      }
      return;
    }

    const marker = currentMarkerRef.current;

    // Cancel any in-flight glide before deciding the new motion.
    if (markerAnimRef.current != null) {
      cancelAnimationFrame(markerAnimRef.current);
      markerAnimRef.current = null;
    }

    // Glide ALONG the road points from the marker's current index to the
    // new target, so a step-sync batch (Health Connect delivers ~30s of
    // steps at once) slides the marker smoothly instead of teleporting
    // ("歩数は増えるが まとめて移動" → continuous glide). Snap (no glide)
    // when there's no road path yet, or the built window was just rebuilt
    // (the cached index belongs to a different points array).
    const canGlide =
      !!built &&
      built.allPoints.length > 1 &&
      targetIdx >= 0 &&
      builtIdentityRef.current === built &&
      markerIdxRef.current != null;
    builtIdentityRef.current = built;

    if (!canGlide) {
      marker.setPosition(targetPos);
      markerIdxRef.current = targetIdx >= 0 ? targetIdx : null;
    } else {
      const pts = built!.allPoints;
      const fromIdx = markerIdxRef.current!;
      const toIdx = targetIdx;
      // Position at a fractional index = lerp between adjacent road pts,
      // so the marker tracks the road's curve, not a straight chord.
      const posAt = (fi: number): google.maps.LatLngLiteral => {
        const c = Math.max(0, Math.min(pts.length - 1, fi));
        const lo = Math.floor(c);
        const hi = Math.min(pts.length - 1, lo + 1);
        const f = c - lo;
        return {
          lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * f,
          lng: pts[lo].lng + (pts[hi].lng - pts[lo].lng) * f,
        };
      };
      const fromPos = posAt(fromIdx);
      const jLat = targetPos.lat - fromPos.lat;
      const jLng = targetPos.lng - fromPos.lng;
      const jump2 = jLat * jLat + jLng * jLng;
      // Snap (no glide) for a negligible move OR a big jump. The big-jump
      // snap keeps the marker glued to the walked/future boundary under high
      // boosts (e.g. ×113): a slow glide left it trailing far behind the
      // instantly-updated split line ("マーカーがずれている"). ~2.5e-7°² ≈ 55m.
      if (Math.abs(toIdx - fromIdx) < 0.5 || jump2 > 2.5e-7) {
        marker.setPosition(targetPos);
        markerIdxRef.current = toIdx;
      } else {
        // Short glide (was 1500ms) — long enough to read as motion at ×1,
        // short enough that it catches up to the split each update cycle.
        const durationMs = 350;
        const startT = performance.now();
        const tick = (nowT: number) => {
          const t = Math.min(1, (nowT - startT) / durationMs);
          const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
          const cur = fromIdx + (toIdx - fromIdx) * ease;
          marker.setPosition(posAt(cur));
          markerIdxRef.current = cur;
          if (t < 1) {
            markerAnimRef.current = requestAnimationFrame(tick);
          } else {
            markerIdxRef.current = toIdx;
            markerAnimRef.current = null;
          }
        };
        markerAnimRef.current = requestAnimationFrame(tick);
      }
    }

    // First-render center alignment (route just loaded): pan to the marker.
    if (!initialCenterDoneRef.current && built && mapRef.current) {
      mapRef.current.panTo(targetPos);
      initialCenterDoneRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, position, player.distanceKm]);

  // Cancel any in-flight marker glide animation on unmount.
  useEffect(
    () => () => {
      if (markerAnimRef.current != null) cancelAnimationFrame(markerAnimRef.current);
    },
    [],
  );

  // Auto-pan was removed — it fought the user's manual pinch/zoom: every
  // step's distanceKm change re-fired this effect, and if the marker had
  // drifted outside the inner box (because the user panned away to look
  // at a future stop) the map was yanked back to the player. Now the
  // map stays wherever the user put it; tap 📍 to recenter.

  // Foreground recenter: when the page becomes visible again (user
  // re-opens the app), pan back to the player's current position.
  // This makes "open the app" always show "where I am now" without the
  // problems the always-on auto-pan caused.
  useEffect(() => {
    if (!loaded) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const map = mapRef.current;
      if (!map) return;
      map.panTo(position);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  if (error) {
    return (
      <div style={{ padding: 16, color: '#dc2626', fontSize: 14 }}>
        地図エラー: {error}
      </div>
    );
  }

  if (!loaded) {
    return <div style={{ padding: 16, color: '#64748b' }}>地図を読み込み中...</div>;
  }

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    // Use the marker's currently rendered position (already polyline-
    // snapped) rather than the great-circle `position`, otherwise tap
    // 📍 sends you 5km off where the marker actually sits.
    const target = currentMarkerRef.current?.getPosition();
    map.panTo(target ?? position);
    if ((map.getZoom() ?? 16) < 14) map.setZoom(16);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <button
        type="button"
        className="map-recenter"
        onClick={recenter}
        aria-label="現在地に戻る"
        title="現在地に戻る"
      >
        📍
      </button>
    </div>
  );
}
