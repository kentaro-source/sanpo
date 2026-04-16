import type { ReactNode } from 'react';
import { Header } from './Header';

interface Props {
  map: ReactNode;
  panel: ReactNode;
}

export function AppLayout({ map, panel }: Props) {
  return (
    <div className="app-layout">
      <Header />
      <div className="map-container">{map}</div>
      <div className="bottom-panel">{panel}</div>
    </div>
  );
}
