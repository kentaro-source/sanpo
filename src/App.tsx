import { GameProvider } from './contexts/GameContext';
import { AppLayout } from './components/layout/AppLayout';
import { MapView } from './components/map/MapView';
import { ProgressInfo } from './components/stats/ProgressInfo';
import { BonusToast } from './components/stats/BonusToast';
import { StepInput } from './components/dice/StepInput';
import { DiceButton } from './components/dice/DiceButton';
// GoogleFitButton intentionally NOT rendered: the in-browser pedometer
// covers the foreground use case, Fit Cloud's lag made the Fit-driven
// path unreliable, and the resulting double-source bookkeeping kept
// causing visible bugs (+6732歩 phantom jumps, '+N 同期' toasts that
// didn't match what the reducer actually credited). Disabled until
// Capacitor + Health Connect comes in for proper background sync.
import { PedometerStatus } from './components/dice/PedometerStatus';
import './App.css';

function BottomPanel() {
  return (
    <>
      <PedometerStatus />
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
        map={
          <>
            <MapView />
            <BonusToast />
          </>
        }
        panel={<BottomPanel />}
      />
    </GameProvider>
  );
}

export default App;
