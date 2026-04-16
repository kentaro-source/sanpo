import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useGame } from '../../hooks/useGame';
import { RoutePolyline } from './RoutePolyline';
import { SquareDots } from './SquareDots';
import { CapitalMarkers } from './CapitalMarkers';
import { CurrentPositionMarker } from './CurrentPositionMarker';

function FlyToPosition() {
  const map = useMap();
  const { currentSquare } = useGame();
  const prevSquareRef = useRef(currentSquare.index);

  useEffect(() => {
    if (currentSquare.index !== prevSquareRef.current) {
      map.flyTo([currentSquare.lat, currentSquare.lng], map.getZoom(), {
        duration: 1,
      });
      prevSquareRef.current = currentSquare.index;
    }
  }, [currentSquare, map]);

  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export function MapView() {
  const { currentSquare } = useGame();

  return (
    <MapContainer
      center={[currentSquare.lat, currentSquare.lng]}
      zoom={4}
      className="leaflet-map"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
      />
      <RoutePolyline />
      <SquareDots />
      <CapitalMarkers />
      <CurrentPositionMarker />
      <FlyToPosition />
      <InvalidateSize />
    </MapContainer>
  );
}
