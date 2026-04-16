import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGame } from '../../hooks/useGame';

export function SquareDots() {
  const map = useMap();
  const { player, routeData } = useGame();
  const currentIdx = player.currentSquareIndex;
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const group = L.layerGroup();
    layerRef.current = group;

    for (let i = 0; i < routeData.squares.length; i++) {
      const sq = routeData.squares[i];
      if (sq.isCapital) continue;

      const isPassed = i <= currentIdx;

      L.circleMarker([sq.lat, sq.lng], {
        radius: 3,
        color: isPassed ? '#059669' : '#9ca3af',
        weight: 1,
        fillColor: isPassed ? '#34d399' : '#d1d5db',
        fillOpacity: isPassed ? 0.8 : 0.5,
        interactive: false,
      }).addTo(group);
    }

    group.addTo(map);

    return () => {
      map.removeLayer(group);
    };
  }, [map, currentIdx, routeData]);

  return null;
}
