import { GameProvider } from './contexts/GameContext';
import { AppLayout } from './components/layout/AppLayout';
import { MapView } from './components/map/MapView';
import { ProgressInfo } from './components/stats/ProgressInfo';
import { StepInput } from './components/dice/StepInput';
import { DiceButton } from './components/dice/DiceButton';
import './App.css';

function BottomPanel() {
  return (
    <>
      <ProgressInfo />
      <StepInput />
      <DiceButton />
    </>
  );
}

function App() {
  return (
    <GameProvider>
      <AppLayout
        map={<MapView />}
        panel={<BottomPanel />}
      />
    </GameProvider>
  );
}

export default App;
