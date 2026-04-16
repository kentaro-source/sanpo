import { Polyline } from 'react-leaflet';
import { useMemo } from 'react';
import { useGame } from '../../hooks/useGame';

export function RoutePolyline() {
  const { player, routeData } = useGame();
  const currentIdx = player.currentSquareIndex;

  const { passed, upcoming } = useMemo(() => {
    const passedCoords: [number, number][] = [];
    const upcomingCoords: [number, number][] = [];

    for (let i = 0; i < routeData.squares.length; i++) {
      const sq = routeData.squares[i];
      const coord: [number, number] = [sq.lat, sq.lng];
      if (i <= currentIdx) {
        passedCoords.push(coord);
      } else {
        upcomingCoords.push(coord);
      }
    }

    if (currentIdx < routeData.squares.length) {
      const cur = routeData.squares[currentIdx];
      upcomingCoords.unshift([cur.lat, cur.lng]);
    }

    return { passed: passedCoords, upcoming: upcomingCoords };
  }, [currentIdx, routeData]);

  return (
    <>
      {passed.length > 1 && (
        <Polyline
          positions={passed}
          pathOptions={{ color: '#10b981', weight: 2, opacity: 0.3 }}
        />
      )}
      {upcoming.length > 1 && (
        <Polyline
          positions={upcoming}
          pathOptions={{ color: '#94a3b8', weight: 1, opacity: 0.2 }}
        />
      )}
    </>
  );
}
