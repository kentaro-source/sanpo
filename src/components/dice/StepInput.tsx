import { useGame } from '../../hooks/useGame';

export function StepInput() {
  const { player, config } = useGame();

  const progress = player.stepsTowardNextDie;
  const progressPercent = (progress / config.stepsPerDie) * 100;

  // Manual input form + Fit diagnostic line both removed: pedometer is
  // now the sole step source. Just show progress toward the next chip.
  return (
    <div className="step-input">
      <div className="step-progress">
        <div className="step-progress-bar">
          <div className="step-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="step-progress-text">
          {progress.toLocaleString()} / {config.stepsPerDie.toLocaleString()} 歩
        </span>
      </div>
    </div>
  );
}
