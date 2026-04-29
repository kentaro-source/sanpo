interface Props {
  face: number; // 1-6
  size?: number; // px
  variant?: 'red' | 'white';
}

/** Visual die with proper pip dots, real Asian casino style. */
export function Die({ face, size = 28, variant = 'red' }: Props) {
  const PIPS: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  const pips = PIPS[face] ?? [];
  // Center pip on face=1 is bigger/more prominent (traditional Asian style)
  const basePipPercent = 24;
  const onePipPercent = 42;
  const isOne = face === 1;
  const pipSize = Math.round((size * (isOne ? onePipPercent : basePipPercent)) / 100);

  const isRedFace = variant === 'red' && (face === 1 || face === 4);
  const radius = Math.max(4, Math.round(size * 0.14));

  return (
    <div
      className="die"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
      }}
    >
      <div className="die-face" style={{ borderRadius: radius }}>
        {pips.map(([r, c], i) => (
          <div
            key={i}
            className={`die-pip ${isRedFace ? 'die-pip-red' : 'die-pip-black'}`}
            style={{
              width: pipSize,
              height: pipSize,
              top: `${r * 50}%`,
              left: `${c * 50}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
