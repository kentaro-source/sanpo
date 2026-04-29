/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data';

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=quarterly&loading=async&libraries=marker`;
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
  const capitalMarkersRef = useRef<google.maps.Marker[]>([]);
  const cityMarkersRef = useRef<google.maps.Marker[]>([]);
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
