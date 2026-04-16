import { useState } from 'react';
import { useGame } from '../../hooks/useGame';

export function StepInput() {
  const { addSteps, player, config } = useGame();
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const steps = parseInt(value, 10);
    if (steps > 0) {
      addSteps(steps);
      setValue('');
    }
  };

  const progress = player.stepsTowardNextDie;
  const progressPercent = (progress / config.stepsPerDie) * 100;

  return (
    <div className="step-input">
      <form onSubmit={handleSubmit} className="step-input-form">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="歩数を入力"
          className="step-input-field"
          min="0"
        />
        <button type="submit" className="step-input-btn" disabled={!value || parseInt(value) <= 0}>
          追加
        </button>
      </form>
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
