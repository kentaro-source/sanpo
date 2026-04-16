import type { DiceRoll, Capital } from '../../types';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

interface Props {
  roll: DiceRoll | null;
  landedCapital: Capital | null | undefined;
}

export function DiceResult({ roll, landedCapital }: Props) {
  if (!roll) return null;

  return (
    <div className="dice-result">
      <span className="dice-face">{DICE_FACES[roll.roll - 1]}</span>
      <span className="dice-result-text">{roll.roll}マス進んだ！</span>
      {landedCapital && (
        <div className="capital-bonus">
          🎯 {landedCapital.nameJa}にぴったり到着！ボーナス🎲+1
        </div>
      )}
    </div>
  );
}
