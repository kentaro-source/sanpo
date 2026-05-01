import { GameProvider } from './contexts/GameContext';
import { AppLayout } from './components/layout/AppLayout';
import { MapView } from './components/map/MapView';
import { ProgressInfo } from './components/stats/ProgressInfo';
import { BonusToast } from './components/stats/BonusToast';
import { StepInput } from './components/dice/StepInput';
import { DiceButton } from './components/dice/DiceButton';
import { GoogleFitButton } from './components/dice/GoogleFitButton';
import './App.css';

function BottomPanel() {
  return (
    <>
      <ProgressInfo />
      <GoogleFitButton />
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
