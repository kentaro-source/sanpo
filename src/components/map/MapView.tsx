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
      zoom: 4,
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

  // Render route polylines (recompute on position change)
  useEffect(() => {
    if (!mapRef.current) return;

    passedPolylineRef.current?.setMap(null);
    upcomingPolylineRef.current?.setMap(null);

    const passedPath: google.maps.LatLngLiteral[] = [];
    const upcomingPath: google.maps.LatLngLiteral[] = [];
    const currentIdx = player.currentSquareIndex;
    for (let i = 0; i < routeData.squares.length; i++) {
      const sq = routeData.squares[i];
      const point = { lat: sq.lat, lng: sq.lng };
      if (i <= currentIdx) {
        passedPath.push(point);
      } else {
        upcomingPath.push(point);
      }
    }
    if (currentIdx < routeData.squares.length) {
      const cur = routeData.squares[currentIdx];
      upcomingPath.unshift({ lat: cur.lat, lng: cur.lng });
    }

    if (passedPath.length > 1) {
      passedPolylineRef.current = new google.maps.Polyline({
        path: passedPath,
        strokeColor: '#10b981',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map: mapRef.current,
      });
    }
    if (upcomingPath.length > 1) {
      upcomingPolylineRef.current = new google.maps.Polyline({
        path: upcomingPath,
        strokeOpacity: 0,
        strokeColor: '#94a3b8',
        strokeWeight: 2,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.5,
              strokeColor: '#94a3b8',
              scale: 3,
            },
            offset: '0',
            repeat: '12px',
          },
        ],
        map: mapRef.current,
      });
    }
  }, [loaded, player.currentSquareIndex, routeData]);

  // Render real route polylines from segmentClassifications (Batch N waypoint cities)
  // Uses Directions API for land segments to follow real roads.
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    let cancelled = false;

    const ROUTE_COLORS: Record<string, string> = {
      land: '#dc2626',
      sea: '#0ea5e9',
      mixed: '#a855f7',
      fantasy: '#f59e0b',
    };

    // Clear existing
    realRoutePolylinesRef.current.forEach((p) => p.setMap(null));
    realRoutePolylinesRef.current = [];

    async function renderSegments() {
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

        let path: google.maps.LatLngLiteral[];

        if (seg.routeType === 'land') {
          // Try Directions API for road following across all waypoints in one call
          const roadPath = await getRoadPolyline(origin, destination, waypoints);
          if (cancelled) return;
          path = roadPath ?? [origin, ...waypoints, destination];
        } else if (seg.routeType === 'mixed') {
          // Render pair-by-pair: sea sub-segments straight, land sub-segments via Directions API
          const points = [origin, ...waypoints, destination];
          const seaSet = new Set(
            (seg.seaSegments ?? []).map(([a, b]) => `${a}-${b}`),
          );
          const built: google.maps.LatLngLiteral[] = [];
          for (let i = 0; i < points.length - 1; i++) {
            if (cancelled) return;
            const isSea = seaSet.has(`${i}-${i + 1}`);
            let segPath: google.maps.LatLngLiteral[];
            if (isSea) {
              segPath = [points[i], points[i + 1]];
            } else {
              const road = await getRoadPolyline(points[i], points[i + 1]);
              if (cancelled) return;
              segPath = road ?? [points[i], points[i + 1]];
            }
            if (i === 0) built.push(...segPath);
            else built.push(...segPath.slice(1));
          }
          path = built;
        } else {
          // sea / fantasy: straight lines through waypoints
          path = [origin, ...waypoints, destination];
        }

        if (cancelled || !mapRef.current) return;

        const color = ROUTE_COLORS[seg.routeType] ?? '#dc2626';
        const polyline = new google.maps.Polyline({
          path,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 4,
          zIndex: 5,
          // Curve along the great-circle so straight 2-point sea/fantasy
          // segments don't render as a Mercator straight line.
          geodesic: true,
          map: mapRef.current,
        });
        realRoutePolylinesRef.current.push(polyline);
      }
    }

    renderSegments().catch((e) => {
      console.error('Real route polyline error:', e);
    });

    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // Render capital markers (once after load + visited update)
  useEffect(() => {
    if (!mapRef.current) return;

    capitalMarkersRef.current.forEach((m) => m.setMap(null));
    capitalMarkersRef.current = [];

    for (const capital of routeData.capitals) {
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
  }, [loaded, player.visitedCapitals, routeData]);

  // Render city markers (once)
  useEffect(() => {
    if (!mapRef.current) return;

    cityMarkersRef.current.forEach((m) => m.setMap(null));
    cityMarkersRef.current = [];

    for (const city of cities) {
      const color = TYPE_COLORS[city.type] ?? '#6b7280';
      const m = new google.maps.Marker({
        position: { lat: city.lat, lng: city.lng },
        map: mapRef.current,
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
  }, [loaded]);

  // Render square dots (one tiny circle per non-capital square).
  // Created once after load; only color/opacity is updated when position changes.
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    if (squareMarkersRef.current.length > 0) return; // already created

    for (let i = 0; i < routeData.squares.length; i++) {
      const sq = routeData.squares[i];
      if (sq.isCapital) continue;
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
  }, [loaded, routeData]);

  // Update square dot colors when current position changes (passed = green, upcoming = gray).
  useEffect(() => {
    const currentIdx = player.currentSquareIndex;
    for (const m of squareMarkersRef.current) {
      const i = (m as unknown as { _idx: number })._idx;
      const passed = i <= currentIdx;
      m.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        scale: passed ? 4 : 2,
        fillColor: passed ? '#16a34a' : '#cbd5e1',
        fillOpacity: passed ? 1 : 0.85,
        strokeColor: passed ? '#14532d' : '#475569',
        strokeWeight: passed ? 1.5 : 0.5,
      });
    }
  }, [player.currentSquareIndex]);

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
