import { CircleMarker, Popup } from 'react-leaflet';
import { useGame } from '../../hooks/useGame';

export function CurrentPositionMarker() {
  const { currentSquare, currentCapital } = useGame();

  return (
    <CircleMarker
      center={[currentSquare.lat, currentSquare.lng]}
      radius={8}
      pathOptions={{
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 1,
        weight: 3,
      }}
    >
      <Popup>
        <div style={{ textAlign: 'center' }}>
          <strong>現在地</strong>
          {currentCapital && (
            <>
              <br />
              {currentCapital.nameJa} ({currentCapital.countryJa})
            </>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}
