import { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { useGoogleFitConnection } from '../../hooks/useGoogleFitConnection';

export function StepInput() {
  const { addSteps, player, config } = useGame();
  const { connected } = useGoogleFitConnection();
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

  // Diagnostic line so the user can verify Fit is actually returning fresh
  // data. Shows "what Fit said today's total is" + when we last asked.
  const fitToday = player.todayStepsBaseline;
  const lastSync = player.lastSyncTimestamp;
  const fitInfo = connected && lastSync
    ? `Fit: ${(fitToday ?? 0).toLocaleString()}歩 / ${new Date(lastSync).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 同期`
    : null;

  return (
    <div className="step-input">
      {!connected && (
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
      )}
      <div className="step-progress">
        <div className="step-progress-bar">
          <div className="step-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="step-progress-text">
          {progress.toLocaleString()} / {config.stepsPerDie.toLocaleString()} 歩
        </span>
      </div>
      {fitInfo && (
        <div
          className="step-fit-info"
          onClick={() => window.dispatchEvent(new CustomEvent('sanpo-force-sync'))}
          title="タップで手動同期"
        >
          {fitInfo} 🔄
        </div>
      )}
    </div>
  );
}
