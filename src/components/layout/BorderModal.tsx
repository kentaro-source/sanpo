import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data/cities';

/** Officer flips first (0 – OFFICER_REVEAL_MS), then the player flip
 *  starts. Total flip cycle = OFFICER_REVEAL_MS + PLAYER_FLIP_MS. */
const OFFICER_REVEAL_MS = 600;
const PLAYER_FLIP_MS = 600;
const FLIP_MS = OFFICER_REVEAL_MS + PLAYER_FLIP_MS;

const SUITS = ['♠', '♥', '♦', '♣'] as const;
type Suit = (typeof SUITS)[number];

interface DrawnCard {
  suit: Suit;
  rank: string;
  value: number;
  isRed: boolean;
}

const RANK_DEFS: Array<{ label: string; value: number }> = [
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: 'J', value: 11 },
  { label: 'Q', value: 12 },
  { label: 'K', value: 13 },
  { label: 'A', value: 14 },
];

function drawCard(): DrawnCard {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const r = RANK_DEFS[Math.floor(Math.random() * RANK_DEFS.length)];
  return {
    suit,
    rank: r.label,
    value: r.value,
    isRed: suit === '♥' || suit === '♦',
  };
}

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return '';
  const A = 'A'.charCodeAt(0);
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - A))
    .join('');
}

interface Props {
  onClose: () => void;
}

export function BorderModal({ onClose }: Props) {
  const { player, routeData, rollBorder } = useGame();
  const pb = player.pendingBorder;
  const target = useMemo(() => {
    if (!pb) return null;
    const country = routeData.capitals.find((c) => c.id === pb.country);
    if (pb.kind === 'capital') {
      const cap = routeData.capitals.find((c) => c.id === pb.id);
      return {
        nameJa: cap?.nameJa ?? pb.id,
        countryJa: country?.countryJa ?? pb.country,
        countryCode: pb.country,
      };
    }
    const city = cities.find((c) => c.id === pb.id);
    return {
      nameJa: city?.nameJa ?? pb.id,
      countryJa: country?.countryJa ?? pb.country,
      countryCode: pb.country,
    };
  }, [pb, routeData.capitals]);

  const [pair, setPair] = useState<[DrawnCard, DrawnCard] | null>(null);
  const [pickedIdx, setPickedIdx] = useState<0 | 1 | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [officerRevealed, setOfficerRevealed] = useState(false);
  const [playerRevealed, setPlayerRevealed] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<
    {
      kind: 'win' | 'lose' | 'tie';
      you: DrawnCard;
      officer: DrawnCard;
      youIdx: 0 | 1;
    } | null
  >(null);

  const flipBorderIdRef = useRef<string | null>(null);

  // Pre-draw a fresh pair when there isn't one and we're not mid-flip.
  // Resets after each round (lastOutcome is cleared by handlePick).
  useEffect(() => {
    if (!pair && !flipping && !lastOutcome) {
      setPair([drawCard(), drawCard()]);
    }
  }, [pair, flipping, lastOutcome]);

  const handlePick = (idx: 0 | 1) => {
    if (flipping || !pb || !pair || player.availableDice < 1) return;
    const my = pair[idx];
    const off = pair[1 - idx];
    const won = my.value > off.value;
    flipBorderIdRef.current = pb.id;
    setPickedIdx(idx);
    setLastOutcome(null);
    setFlipping(true);
    setOfficerRevealed(false);
    setPlayerRevealed(false);
    rollBorder(
      'red',
      won ? 'win' : 'lose',
      `${my.rank}${my.suit} vs ${off.rank}${off.suit}`,
    );
    // Officer's card flips first; player's draw is held back so the
    // moment of truth lands last (= the satirical immigration agony).
    window.setTimeout(() => setOfficerRevealed(true), OFFICER_REVEAL_MS);
    window.setTimeout(() => {
      setPlayerRevealed(true);
      setFlipping(false);
    }, FLIP_MS);
  };

  // After flip settles, lock in outcome by checking pendingBorder cleared.
  useEffect(() => {
    if (flipping || pickedIdx == null || !pair) return;
    const snap = flipBorderIdRef.current;
    if (!snap) return;
    const my = pair[pickedIdx];
    const off = pair[1 - pickedIdx];
    const won = !pb || pb.id !== snap;
    const tie = !won && my.value === off.value;
    setLastOutcome({
      kind: won ? 'win' : tie ? 'tie' : 'lose',
      you: my,
      officer: off,
      youIdx: pickedIdx,
    });
    flipBorderIdRef.current = null;
    setPickedIdx(null);
  }, [flipping, pb, pickedIdx, pair]);

  // Reset pair for the next round once the result has been shown.
  const handleAgain = () => {
    setLastOutcome(null);
    setPair(null);
    setOfficerRevealed(false);
    setPlayerRevealed(false);
  };

  if (!pb || !target) return null;

  const flag = flagEmoji(target.countryCode);
  const noChips = player.availableDice < 1;
  const phase: 'pick' | 'flipping' | 'result' = lastOutcome
    ? 'result'
    : flipping
    ? 'flipping'
    : 'pick';
  // The picked slot is "you"; the other is the officer. Held in pickedIdx
  // during the flip animation, then in lastOutcome.youIdx after.
  const youIdx: 0 | 1 | null = pickedIdx ?? lastOutcome?.youIdx ?? null;

  const renderCardSlot = (idx: 0 | 1) => {
    const card = pair?.[idx];
    const isYou = youIdx === idx;
    const isOfficerSlot = youIdx !== null && !isYou;
    // Stagger: officer reveals at OFFICER_REVEAL_MS, player at FLIP_MS.
    // After the round ends, lastOutcome is set and both reveal as a
    // safety fallback.
    const reveal =
      card != null &&
      (lastOutcome != null ||
        (isYou && playerRevealed) ||
        (isOfficerSlot && officerRevealed));
    const label =
      phase === 'result' && reveal
        ? isYou
          ? '👤 あなた'
          : '🛂 審査官'
        : `カード ${idx + 1}`;
    // While flipping, only the slot that is currently mid-spin gets the
    // animation class. Officer spins first (0 → OFFICER_REVEAL_MS),
    // player spins second.
    const spinning =
      flipping &&
      ((isOfficerSlot && !officerRevealed) || (isYou && officerRevealed && !playerRevealed));
    return (
      <button
        type="button"
        key={idx}
        className={`border-cardslot ${
          phase === 'pick' && !noChips ? 'is-pickable' : ''
        } ${isYou && phase === 'result' ? 'is-bet' : ''}`}
        disabled={phase !== 'pick' || noChips}
        onClick={() => handlePick(idx)}
      >
        <div className="border-cardslot-label">{label}</div>
        <div className={`border-card ${spinning ? 'border-card-flipping' : ''}`}>
          {reveal && card ? (
            <span
              className={`border-card-face ${card.isRed ? 'is-red' : 'is-black'}`}
            >
              <span className="border-card-corner top">
                {card.rank}
                <span className="border-card-corner-suit">{card.suit}</span>
              </span>
              <span className="border-card-suit">{card.suit}</span>
              <span className="border-card-corner bottom">
                {card.rank}
                <span className="border-card-corner-suit">{card.suit}</span>
              </span>
            </span>
          ) : (
            <span className="border-card-back" aria-hidden="true" />
          )}
        </div>
      </button>
    );
  };

  return createPortal(
    <div className="border-overlay">
      <div className="border-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="border-header">
          <span className="border-title">🛂 入国審査</span>
          <button
            type="button"
            className="menu-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </header>
        <div className="border-body">
          <div className="border-target">
            <span className="border-flag">{flag}</span>
            <span className="border-cap-name">{target.countryJa}</span>
          </div>

          <div className="border-cards-row">
            {renderCardSlot(0)}
            <div className="border-vs">VS</div>
            {renderCardSlot(1)}
          </div>

          {lastOutcome?.kind === 'win' && (
            <div className="border-result border-result-win">🎉</div>
          )}
          {lastOutcome?.kind === 'tie' && (
            <div className="border-result border-result-lose">🤝</div>
          )}
          {lastOutcome?.kind === 'lose' && (
            <div className="border-result border-result-lose">💸</div>
          )}

          {phase === 'result' && lastOutcome && lastOutcome.kind !== 'win' && (
            <button
              type="button"
              className="border-draw-btn"
              disabled={noChips}
              onClick={handleAgain}
            >
              もう一度 (<span className="chip-icon" aria-hidden="true" />)
            </button>
          )}
          <div className="border-chip-count">
            <span className="chip-icon" aria-hidden="true" /> {player.availableDice}
          </div>
          {noChips && <div className="border-no-chips">チップ切れ 🚶</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
