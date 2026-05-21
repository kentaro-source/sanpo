import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../hooks/useGame';
import { cities } from '../../data/cities';
import {
  isRealLifeVisitedCapital,
  isRealLifeVisitedCity,
} from '../../data/realLifeVisited';
import { playCardFlip, playCardPlace } from '../../services/sound';

/** Drag distance (px) that maps to a full 0→180° card reveal. */
const REVEAL_DRAG_PX = 150;
/** Movement before the squeeze axis/direction locks in. */
const AXIS_LOCK_PX = 8;
/** Release past this reveal fraction commits the flip. */
const COMMIT_AT = 0.5;

const OFFICER_IMG = `${import.meta.env.BASE_URL}img/officer.png`;

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

interface TargetInfo {
  nameJa: string;
  countryJa: string;
  countryCode: string;
  kind: 'capital' | 'city';
}

interface BonusInfo {
  total: number;
  lines: string[];
}

interface Outcome {
  kind: 'win' | 'lose' | 'tie';
  you: DrawnCard;
  officer: DrawnCard;
  youIdx: 0 | 1;
  bonus: BonusInfo | null;
}

/** Live squeeze state — kept in a ref for the pointer handlers and
 *  mirrored to React state for rendering. */
interface SqueezeState {
  axis: 'x' | 'y' | null;
  dir: 1 | -1;
  angle: number; // 0–180
  dragging: boolean;
  soundStep: number; // last crackle threshold played
}

const FRESH_SQUEEZE: SqueezeState = {
  axis: null,
  dir: 1,
  angle: 0,
  dragging: false,
  soundStep: 0,
};

interface Props {
  onClose: () => void;
}

export function BorderModal({ onClose }: Props) {
  const { player, routeData, rollBorder } = useGame();
  const pb = player.pendingBorder;
  // Chip "fee" this border demands (random 1–5, fixed per border).
  const costRef = useRef(1);
  if (pb?.cost) costRef.current = pb.cost;
  const cost = pb?.cost ?? costRef.current;

  const target = useMemo<TargetInfo | null>(() => {
    if (!pb) return null;
    const country = routeData.capitals.find((c) => c.id === pb.country);
    const countryJa = country?.countryJa ?? pb.country;
    if (pb.kind === 'capital') {
      const cap = routeData.capitals.find((c) => c.id === pb.id);
      return {
        nameJa: cap?.nameJa ?? pb.id,
        countryJa,
        countryCode: pb.country,
        kind: 'capital',
      };
    }
    const city = cities.find((c) => c.id === pb.id);
    return {
      nameJa: city?.nameJa ?? pb.id,
      countryJa,
      countryCode: pb.country,
      kind: 'city',
    };
  }, [pb, routeData.capitals]);

  // Snapshot target so it survives a win clearing pendingBorder.
  const targetRef = useRef<TargetInfo | null>(null);
  if (target) targetRef.current = target;
  const shownTarget = target ?? targetRef.current;

  const [pair, setPair] = useState<[DrawnCard, DrawnCard] | null>(null);
  const [playerIdx, setPlayerIdx] = useState<0 | 1 | null>(null);
  const [officerRevealed, setOfficerRevealed] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<Outcome | null>(null);
  const [sq, setSq] = useState<SqueezeState>(FRESH_SQUEEZE);

  const sqRef = useRef<SqueezeState>(FRESH_SQUEEZE);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);

  const syncSqueeze = (next: SqueezeState) => {
    sqRef.current = next;
    setSq(next);
  };

  // Pre-draw a fresh pair when idle.
  useEffect(() => {
    if (!pair && !lastOutcome && playerIdx === null) {
      setPair([drawCard(), drawCard()]);
    }
  }, [pair, lastOutcome, playerIdx]);

  /** Bonus the player earns by winning entry — mirrors ROLL_BORDER. */
  const computeBonus = (): BonusInfo => {
    if (!pb) return { total: 0, lines: [] };
    if (pb.kind === 'capital') {
      const cap = routeData.capitals.find((c) => c.id === pb.id);
      const name = cap?.nameJa ?? pb.id;
      const irl = isRealLifeVisitedCapital(pb.id);
      const lines = [`🏛 ${name} 通過 +5`];
      if (irl) lines.push(`★ 懐かしの${name} 思い出 +5`);
      return { total: irl ? 10 : 5, lines };
    }
    const city = cities.find((c) => c.id === pb.id);
    const name = city?.nameJa ?? pb.id;
    const irl = city?.visitedInRealLife === true || isRealLifeVisitedCity(pb.id);
    const lines = [`📍 ${name} 立ち寄り +3`];
    if (irl) lines.push(`★ 懐かしの${name} 思い出 +3`);
    return { total: irl ? 6 : 3, lines };
  };

  const resolveOutcome = () => {
    if (playerIdx === null || !pair) return;
    const my = pair[playerIdx];
    const off = pair[1 - playerIdx];
    const won = my.value > off.value;
    const tie = my.value === off.value;
    const bonus = won ? computeBonus() : null;
    setLastOutcome({
      kind: won ? 'win' : tie ? 'tie' : 'lose',
      you: my,
      officer: off,
      youIdx: playerIdx,
      bonus,
    });
    rollBorder(
      'red',
      won ? 'win' : 'lose',
      `${my.rank}${my.suit} vs ${off.rank}${off.suit}`,
    );
    setCommitting(false);
  };

  const canSqueeze =
    !!pb && !lastOutcome && !committing && player.availableDice >= cost;

  const onPointerDown = (idx: 0 | 1, e: React.PointerEvent) => {
    if (!canSqueeze || !pair) return;
    if (playerIdx !== null && playerIdx !== idx) return; // locked to one card
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Pointer may not be capturable (e.g. synthetic events) — drag
      // still works via the element's own move/up handlers.
    }
    pointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    syncSqueeze({ ...FRESH_SQUEEZE, dragging: true });
    if (playerIdx === null) {
      setPlayerIdx(idx);
      // Officer (the other card) reveals first — you squeeze yours last.
      setOfficerRevealed(true);
      playCardFlip(0.9);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = sqRef.current;
    if (!s.dragging || e.pointerId !== pointerIdRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    let axis = s.axis;
    let dir = s.dir;
    if (!axis) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis = Math.abs(dx) >= Math.abs(dy) ? 'y' : 'x';
      dir = (axis === 'y' ? dx : dy) >= 0 ? 1 : -1;
    }
    const delta = (axis === 'y' ? dx : dy) * dir;
    const progress = Math.min(1, Math.max(0, delta / REVEAL_DRAG_PX));
    // Paper crackle as the squeeze peels open (only while progressing).
    const step = Math.floor(progress / 0.25);
    let soundStep = s.soundStep;
    if (step > soundStep) {
      soundStep = step;
      playCardFlip(0.32);
    }
    syncSqueeze({ axis, dir, angle: progress * 180, dragging: true, soundStep });
  };

  const endSqueeze = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    const angle = sqRef.current.angle;
    if (angle >= 180 * COMMIT_AT) {
      // Commit — snap fully open, then resolve.
      syncSqueeze({ ...sqRef.current, angle: 180, dragging: false });
      setCommitting(true);
      playCardPlace(0.95);
      window.setTimeout(resolveOutcome, 300);
    } else {
      // Released too early — spring back, squeeze can be retried.
      syncSqueeze(FRESH_SQUEEZE);
    }
  };

  const handleAgain = () => {
    setLastOutcome(null);
    setPlayerIdx(null);
    setOfficerRevealed(false);
    setCommitting(false);
    syncSqueeze(FRESH_SQUEEZE);
    setPair(null);
  };

  if (!shownTarget) return null;
  if (!pb && !lastOutcome) return null;

  const flag = flagEmoji(shownTarget.countryCode);
  const noChips = player.availableDice < cost;
  const phase: 'pick' | 'squeeze' | 'result' = lastOutcome
    ? 'result'
    : playerIdx !== null
    ? 'squeeze'
    : 'pick';

  const renderCard = (idx: 0 | 1) => {
    const card = pair?.[idx];
    const role: 'player' | 'officer' | 'unclaimed' =
      playerIdx === idx ? 'player' : playerIdx !== null ? 'officer' : 'unclaimed';

    let angle = 0;
    let axis: 'x' | 'y' = 'y';
    let transition = 'none';
    if (role === 'player') {
      angle = sq.angle;
      axis = sq.axis ?? 'y';
      transition = sq.dragging
        ? 'none'
        : 'transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1)';
    } else if (role === 'officer') {
      angle = officerRevealed ? 180 : 0;
      transition = 'transform 0.55s ease';
    }
    const axisLetter = axis === 'x' ? 'X' : 'Y';
    const interactive = canSqueeze && (role === 'unclaimed' || role === 'player');

    const label =
      role === 'player'
        ? '👤 あなた'
        : role === 'officer'
        ? '🛂 審査官'
        : `カード ${idx + 1}`;

    return (
      <div
        key={idx}
        className={`border-cardslot ${
          role === 'player' && phase === 'result' ? 'is-bet' : ''
        }`}
      >
        <div className="border-cardslot-label">{label}</div>
        <div
          className={`border-card ${interactive ? 'is-grabbable' : ''} ${
            role === 'player' && sq.dragging ? 'is-squeezing' : ''
          }`}
          onPointerDown={
            interactive ? (e) => onPointerDown(idx, e) : undefined
          }
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? endSqueeze : undefined}
          onPointerCancel={interactive ? endSqueeze : undefined}
        >
          <div
            className="border-card-inner"
            style={{
              transform: `rotate${axisLetter}(${angle}deg)`,
              transition,
            }}
          >
            <div className="border-card-side border-card-side--back" />
            <div
              className={`border-card-side border-card-side--front ${
                card?.isRed ? 'is-red' : 'is-black'
              }`}
              style={{ transform: `rotate${axisLetter}(180deg)` }}
            >
              {card && (
                <>
                  <span className="border-card-corner top">
                    {card.rank}
                    <span className="border-card-corner-suit">{card.suit}</span>
                  </span>
                  <span className="border-card-suit">{card.suit}</span>
                  <span className="border-card-corner bottom">
                    {card.rank}
                    <span className="border-card-corner-suit">{card.suit}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
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
          <div className="border-officer">
            <img
              className="border-officer-img"
              src={OFFICER_IMG}
              alt="入国審査官"
              draggable={false}
            />
          </div>

          <div className="border-target">
            {flag && <span className="border-flag">{flag}</span>}
            <span className="border-cap-name">{shownTarget.countryJa}</span>
          </div>

          <div className="border-cards-row">
            {renderCard(0)}
            <div className="border-vs">VS</div>
            {renderCard(1)}
          </div>

          {lastOutcome?.kind === 'win' && (
            <div className="border-result border-result-win">
              <div className="border-result-emoji">🎉</div>
              <div className="border-result-total">
                +{lastOutcome.bonus?.total ?? 0}{' '}
                <span className="chip-icon" aria-hidden="true" />
              </div>
            </div>
          )}
          {lastOutcome?.kind === 'tie' && (
            <div className="border-result border-result-lose">
              <div className="border-result-emoji">🤝</div>
              <div className="border-result-total">
                -{cost} <span className="chip-icon" aria-hidden="true" />
              </div>
            </div>
          )}
          {lastOutcome?.kind === 'lose' && (
            <div className="border-result border-result-lose">
              <div className="border-result-emoji">💸</div>
              <div className="border-result-total">
                -{cost} <span className="chip-icon" aria-hidden="true" />
              </div>
            </div>
          )}

          {phase === 'result' && lastOutcome?.kind === 'win' && (
            <button
              type="button"
              className="border-draw-btn"
              onClick={onClose}
            >
              続ける
            </button>
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
            審査料 {cost} <span className="chip-icon" aria-hidden="true" /> ・
            手持ち {player.availableDice}{' '}
            <span className="chip-icon" aria-hidden="true" />
          </div>
          {noChips && pb && (
            <div className="border-no-chips">審査料 {cost}🪙 に足りない 🚶</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
