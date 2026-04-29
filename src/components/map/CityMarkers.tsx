import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { cities } from '../../data';
import { useGame } from '../../hooks/useGame';

const TYPE_COLORS: Record<string, string> = {
  metropolis: '#0ea5e9',
  historic: '#a855f7',
  tourist: '#10b981',
  gourmet: '#f59e0b',
};

export function CityMarkers() {
  const map = useMap();
  const { player } = useGame();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const group = L.layerGroup();
    layerRef.current = group;

    for (const city of cities) {
      const visited = player.visitedCapitals.includes(city.id);
      const color = TYPE_COLORS[city.type] ?? '#6b7280';

      const marker = L.circleMarker([city.lat, city.lng], {
        radius: visited ? 4 : 3,
        color: visited ? color : '#9ca3af',
        fillColor: visited ? color : '#e5e7eb',
        fillOpacity: visited ? 0.9 : 0.5,
        weight: 1,
      });

      marker.bindPopup(
        `<div style="text-align:center;min-width:120px">
          <strong>${city.nameJa}</strong><br/>
          <span style="font-size:0.85em;color:#666">${city.countryJa}</span><br/>
          <span style="font-size:0.8em;color:#666">${city.description}</span>
          ${visited ? '<div style="margin-top:4px;color:#059669;font-size:0.8em">✓ 通過済み</div>' : ''}
        </div>`,
      );

      marker.addTo(group);
    }

    group.addTo(map);

    return () => {
      map.removeLayer(group);
    };
  }, [map, player.visitedCapitals]);

  return null;
}
