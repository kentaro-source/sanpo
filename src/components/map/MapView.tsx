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
  const { player, currentSquare, routeData } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const passedPolylineRef = useRef<google.maps.Polyline | null>(null);
  const upcomingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const realRoutePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const capitalMarkersRef = useRef<google.maps.Marker[]>([]);
  const cityMarkersRef = useRef<google.maps.Marker[]>([]);
  const squareMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
  const prevSquareIndex = useRef(currentSquare.index);
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
      zoom: 11, // tight street-level view — see roads where you're walking
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
    const rdp = (pts: LL[], eps: number): LL[] => {
      if (pts.length < 3) return pts;
      let maxD = 0;
      let maxI = 0;
      const a = pts[0];
      const b = pts[pts.length - 1];
      for (let i = 1; i < pts.length - 1; i++) {
        const d = perpDist(pts[i], a, b);
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > eps) {
        const left = rdp(pts.slice(0, maxI + 1), eps);
        const right = rdp(pts.slice(maxI), eps);
        return [...left.slice(0, -1), ...right];
      }
      return [a, b];
    };
    const simplifyPath = (path: LL[]) => {
      if (path.length <= 4) return path;
      // ~2km tolerance — keeps highway curves, drops dense straight segments
      return rdp(path, 0.02);
    };

    // Clear existing
    realRoutePolylinesRef.current.forEach((p) => p.setMap(null));
    realRoutePolylinesRef.current = [];

    // Build ONE big combined path across all segments and render as a single
    // Polyline. SVG renders a single path much faster than 46 separate paths,
    // especially during pan/zoom on mobile.
    async function renderCombinedRoute() {
      const allPoints: google.maps.LatLngLiteral[] = [];

      for (const seg of segmentClassifications) {
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
            if (i === 0) built.push(...pathSeg);
            else built.push(...pathSeg.slice(1));
          }
          segPath = simplifyPath(built);
        } else {
          // sea / fantasy: straight lines through waypoints
          segPath = [origin, ...waypoints, destination];
        }

        // Append to combined path, skipping duplicate boundary point
        if (allPoints.length === 0) {
          allPoints.push(...segPath);
        } else {
          allPoints.push(...segPath.slice(1));
        }
      }

      if (cancelled || !mapRef.current) return;

      const polyline = new google.maps.Polyline({
        path: allPoints,
        strokeColor: '#2563eb',
        strokeOpacity: 0.85,
        strokeWeight: 3,
        zIndex: 5,
        geodesic: true,
        map: mapRef.current,
      });
      realRoutePolylinesRef.current.push(polyline);
    }

    renderCombinedRoute().catch((e) => {
      console.error('Combined route polyline error:', e);
    });

    return () => {
      cancelled = true;
    };
  }, [loaded]);

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
        position: { lat: currentSquare.lat, lng: currentSquare.lng },
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
      currentMarkerRef.current.setPosition({ lat: currentSquare.lat, lng: currentSquare.lng });
    }
  }, [loaded, currentSquare]);

  // Pan to current position on movement
  useEffect(() => {
    if (!mapRef.current) return;
    if (currentSquare.index !== prevSquareIndex.current) {
      mapRef.current.panTo({ lat: currentSquare.lat, lng: currentSquare.lng });
      prevSquareIndex.current = currentSquare.index;
    }
  }, [currentSquare]);

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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
