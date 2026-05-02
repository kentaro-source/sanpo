/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { cities, segmentClassifications } from '../../data';
import { getRoadPolyline } from '../../services/directions';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const passedPolylineRef = useRef<google.maps.Polyline | null>(null);
  const upcomingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const realRoutePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const builtPathRef = useRef<{
    allPoints: google.maps.LatLngLiteral[];
    cumKm: number[];
  } | null>(null);
  const capitalMarkersRef = useRef<google.maps.Marker[]>([]);
  const cityMarkersRef = useRef<google.maps.Marker[]>([]);
  const squareMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
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
      center: { lat: currentSquare.lat, lng: currentSquare.lng },
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
      // ~100 m tolerance. The previous 0.02° (~2 km) was a great-circle
      // simplifier — it dropped every highway curve smaller than 2 km
      // lateral, so at zoom 16 the polyline looked like a Tokyo→Miyazaki
      // straight line. 0.001° still wipes out dense urban zigzag in the
      // raw Directions response without erasing visible curves.
      return rdp(path, 0.001);
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

    // Linear interpolate between two points.
    const interpAt = (a: LL, b: LL, frac: number): LL => ({
      lat: a.lat + (b.lat - a.lat) * frac,
      lng: a.lng + (b.lng - a.lng) * frac,
    });

    type Built = {
      allPoints: google.maps.LatLngLiteral[];
      cumKm: number[];
    };

    // Materialize walked + future polylines from a Built path. Wipes any
    // existing route polylines first so the rebuild replaces them.
    const renderFromBuilt = (b: Built) => {
      if (!mapRef.current) return;
      realRoutePolylinesRef.current.forEach((p) => p.setMap(null));
      realRoutePolylinesRef.current = [];

      const playerKm = player.distanceKm;
      let splitIdx = -1;
      for (let i = 0; i < b.cumKm.length; i++) {
        if (b.cumKm[i] >= playerKm) {
          splitIdx = i;
          break;
        }
      }
      let walkedPath: google.maps.LatLngLiteral[] = [];
      let futurePath: google.maps.LatLngLiteral[] = [];
      if (splitIdx === -1) {
        walkedPath = b.allPoints;
      } else if (splitIdx === 0) {
        futurePath = b.allPoints;
      } else {
        const a = b.allPoints[splitIdx - 1];
        const c = b.allPoints[splitIdx];
        const segKm = b.cumKm[splitIdx] - b.cumKm[splitIdx - 1];
        const frac = segKm > 0 ? (playerKm - b.cumKm[splitIdx - 1]) / segKm : 0;
        const splitPoint = interpAt(a, c, Math.max(0, Math.min(1, frac)));
        walkedPath = [...b.allPoints.slice(0, splitIdx), splitPoint];
        futurePath = [splitPoint, ...b.allPoints.slice(splitIdx)];
      }

      if (walkedPath.length >= 2) {
        const walkedGlow = new google.maps.Polyline({
          path: walkedPath,
          strokeColor: '#ffffff',
          strokeOpacity: 0.85,
          strokeWeight: 8,
          zIndex: 5,
          geodesic: true,
          map: mapRef.current,
        });
        realRoutePolylinesRef.current.push(walkedGlow);
        const walked = new google.maps.Polyline({
          path: walkedPath,
          strokeColor: '#10b981',
          strokeOpacity: 0.98,
          strokeWeight: 5,
          zIndex: 6,
          geodesic: true,
          map: mapRef.current,
        });
        realRoutePolylinesRef.current.push(walked);
      }
      if (futurePath.length >= 2) {
        // White underglow first, then the colored line on top — gives a
        // strong silhouette against busy urban tiles where a plain line
        // gets lost in the building/road clutter at zoom 16.
        const futureGlow = new google.maps.Polyline({
          path: futurePath,
          strokeColor: '#ffffff',
          strokeOpacity: 0.85,
          strokeWeight: 8,
          zIndex: 4,
          geodesic: true,
          map: mapRef.current,
        });
        realRoutePolylinesRef.current.push(futureGlow);
        const future = new google.maps.Polyline({
          path: futurePath,
          strokeColor: '#2563eb', // blue, high contrast against everything
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 5,
          geodesic: true,
          map: mapRef.current,
        });
        realRoutePolylinesRef.current.push(future);
      }
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

        if (seg.routeType === 'land') {
          const roadPath = await getRoadPolyline(origin, destination, waypoints);
          if (cancelled) return;
          segPath = simplifyPath(roadPath ?? [origin, ...waypoints, destination]);
        } else if (seg.routeType === 'mixed') {
          const points = [origin, ...waypoints, destination];
          const seaSet = new Set(
            (seg.seaSegments ?? []).map(([a, b]) => `${a}-${b}`),
          );
          const built: google.maps.LatLngLiteral[] = [];
          for (let i = 0; i < points.length - 1; i++) {
            if (cancelled) return;
            const isSea = seaSet.has(`${i}-${i + 1}`);
            let pathSeg: google.maps.LatLngLiteral[];
            if (isSea) {
              pathSeg = [points[i], points[i + 1]];
            } else {
              const road = await getRoadPolyline(points[i], points[i + 1]);
              if (cancelled) return;
              pathSeg = road ?? [points[i], points[i + 1]];
            }
            // Spread-push (`built.push(...pathSeg)`) blows the call stack
            // for long paths because each spread arg becomes a function
            // argument and the limit is ~65k. Walk-pushing is safe.
            const start = i === 0 ? 0 : 1;
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
      }

      if (cancelled || !mapRef.current) return;

      // Cache the built geometry so the cheap walked/future split effect
      // can re-render on each step without rebuilding from Directions.
      builtPathRef.current = { allPoints, cumKm };
      renderFromBuilt(builtPathRef.current);
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

    const playerKm = player.distanceKm;
    let splitIdx = -1;
    for (let i = 0; i < b.cumKm.length; i++) {
      if (b.cumKm[i] >= playerKm) {
        splitIdx = i;
        break;
      }
    }
    let walkedPath: google.maps.LatLngLiteral[] = [];
    let futurePath: google.maps.LatLngLiteral[] = [];
    if (splitIdx === -1) {
      walkedPath = b.allPoints;
    } else if (splitIdx === 0) {
      futurePath = b.allPoints;
    } else {
      const a = b.allPoints[splitIdx - 1];
      const c = b.allPoints[splitIdx];
      const segKm = b.cumKm[splitIdx] - b.cumKm[splitIdx - 1];
      const frac = segKm > 0 ? (playerKm - b.cumKm[splitIdx - 1]) / segKm : 0;
      const f = Math.max(0, Math.min(1, frac));
      const splitPoint = {
        lat: a.lat + (c.lat - a.lat) * f,
        lng: a.lng + (c.lng - a.lng) * f,
      };
      walkedPath = [...b.allPoints.slice(0, splitIdx), splitPoint];
      futurePath = [splitPoint, ...b.allPoints.slice(splitIdx)];
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
      capitalMarkersRef.current.push(m);
    }
  }, [loaded, player.visitedCapitals, currentSquare.segmentIndex]);

  // City markers: only created when zooming in close enough to actually see them.
  // Lazy-create on first qualifying zoom to keep initial load fast.
  useEffect(() => {
    if (!mapRef.current) return;

    let created = false;
    const ensureCreated = () => {
      if (created) return;
      created = true;
      for (const city of cities) {
        const color = TYPE_COLORS[city.type] ?? '#6b7280';
        const m = new google.maps.Marker({
          position: { lat: city.lat, lng: city.lng },
          map: mapRef.current,
          clickable: false,
          title: `${city.nameJa} (${city.countryJa}) - ${city.description}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 3,
            fillColor: color,
            fillOpacity: 0.7,
            strokeColor: 'white',
            strokeWeight: 0.8,
          },
        });
        cityMarkersRef.current.push(m);
      }
    };

    const updateCityVisibility = () => {
      const zoom = mapRef.current?.getZoom() ?? 4;
      const shouldShow = zoom >= 7;
      if (shouldShow && !created) ensureCreated();
      for (const m of cityMarkersRef.current) m.setVisible(shouldShow);
    };
    mapRef.current.addListener('zoom_changed', updateCityVisibility);
    updateCityVisibility();

    return () => {
      cityMarkersRef.current.forEach((m) => m.setMap(null));
      cityMarkersRef.current = [];
    };
  }, [loaded]);

  // Square dots: lazy-create only when zoomed close enough to actually see them.
  // Sampling 1/5 keeps marker count manageable when they do exist.
  const SQUARE_SAMPLE = 5;
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

  // Render / move current position marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new google.maps.Marker({
        position,
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
    } else {
      currentMarkerRef.current.setPosition(position);
    }
  }, [loaded, position]);

  // Auto-pan: follow the marker when it leaves the visible viewport.
  // (We don't pan on every tiny step — that fights the user's manual pan.)
  // When the player walks far enough that the marker is near or outside
  // the visible bounds, recenter on them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) {
      map.panTo(position);
      return;
    }
    // Shrink bounds to a "stay-in-view" inner box (75% of viewport). If the
    // marker drifts outside that box, recenter. This way small steps don't
    // jitter the map but a long walk follows the player.
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latPad = (ne.lat() - sw.lat()) * 0.125;
    const lngPad = (ne.lng() - sw.lng()) * 0.125;
    const inside =
      position.lat > sw.lat() + latPad &&
      position.lat < ne.lat() - latPad &&
      position.lng > sw.lng() + lngPad &&
      position.lng < ne.lng() - lngPad;
    if (!inside) map.panTo(position);
  }, [position]);

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
    map.panTo(position);
    // Snap back to a usable street-level zoom in case the user pinched out.
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
