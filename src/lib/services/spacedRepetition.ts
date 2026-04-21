/**
 * SuperMemo-2 algorithm — pure, deterministic, offline-safe.
 *
 * We intentionally map our product's 3-button response (errei / quase / acertei)
 * onto the canonical SM-2 quality scale:
 *
 *   errei   -> 0  (complete blackout)
 *   quase   -> 3  (correct response recalled with serious difficulty)
 *   acertei -> 5  (perfect response)
 *
 * This keeps our UX honest — we reward engagement, NOT speed. The Socratic
 * rule is enforced upstream in gamificationService (XP math lives there).
 *
 * Reference:
 *   Piotr A. Wozniak, "SuperMemo-2" (1987)
 *   https://super-memory.com/english/ol/sm2.htm
 */
export type Sm2Quality = 0 | 3 | 5;

export interface Sm2StateInput {
  ef: number;
  interval: number;
  repetitions: number;
}

export interface Sm2StateOutput extends Sm2StateInput {
  quality: Sm2Quality;
  dueAt: string; // ISO8601
}

export const SM2_INITIAL_EF = 2.5;
export const SM2_MIN_EF = 1.3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Compute the next SM-2 state given a quality rating.
 * `now` is injectable for deterministic tests.
 */
export function schedule(
  state: Sm2StateInput,
  quality: Sm2Quality,
  now: Date = new Date()
): Sm2StateOutput {
  const prevEf = state.ef > 0 ? state.ef : SM2_INITIAL_EF;

  // EF update (Wozniak 1987):
  //   EF' = EF + (0.1 − (5−q)·(0.08 + (5−q)·0.02))
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const ef = clamp(prevEf + delta, SM2_MIN_EF, 5);

  let repetitions: number;
  let intervalDays: number;

  if (quality < 3) {
    // Failed recall: reset repetitions, review again tomorrow.
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(state.interval * ef);
  }

  // Guard against pathological states from external data.
  if (!Number.isFinite(intervalDays) || intervalDays < 1) intervalDays = 1;

  const dueAt = new Date(now.getTime() + intervalDays * MS_PER_DAY).toISOString();

  return {
    ef,
    interval: intervalDays,
    repetitions,
    quality,
    dueAt,
  };
}

/**
 * Parse a persisted sm2_state JSON blob with defensive defaults.
 */
export function readSm2State(raw: unknown): Sm2StateInput {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      ef: typeof r.ef === "number" ? r.ef : SM2_INITIAL_EF,
      interval: typeof r.interval === "number" ? r.interval : 0,
      repetitions: typeof r.repetitions === "number" ? r.repetitions : 0,
    };
  }
  return { ef: SM2_INITIAL_EF, interval: 0, repetitions: 0 };
}
