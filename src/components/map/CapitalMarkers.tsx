import { CircleMarker, Popup } from 'react-leaflet';
import { useMemo } from 'react';
import { useGame } from '../../hooks/useGame';

export function CapitalMarkers() {
  const { player, routeData } = useGame();

  const markers = useMemo(() => {
    return routeData.capitals.map((capital) => {
      const visited = player.visitedCapitals.includes(capital.id);
      return (
        <CircleMarker
          key={capital.id}
          center={[capital.lat, capital.lng]}
          radius={visited ? 5 : 3}
          pathOptions={{
            color: visited ? '#10b981' : '#9ca3af',
            fillColor: visited ? '#10b981' : '#e5e7eb',
            fillOpacity: 0.8,
            weight: 1,
          }}
        >
          <Popup>
            <div style={{ textAlign: 'center', minWidth: 120 }}>
              <strong>{capital.nameJa}</strong>
              <br />
              <span style={{ fontSize: '0.85em', color: '#666' }}>
                {capital.countryJa}
              </span>
              {visited && (
                <div style={{ marginTop: 4, color: '#10b981', fontSize: '0.8em' }}>
                  ✓ 通過済み
                </div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      );
    });
  }, [player.visitedCapitals, routeData.capitals]);

  return <>{markers}</>;
}
