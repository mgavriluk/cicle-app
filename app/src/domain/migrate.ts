/**
 * Миграция v0 → v1.
 *
 * v0 — то, что лежит в localStorage и в cycle.json сейчас:
 *   log: { 'w3d0': { '0': {w, s, d, n} } }   ключ — индекс упражнения в дне
 *
 * v1 — ключ по устойчивому id слота, всё внутри цикла.
 *
 * Индекс в v0 соответствует позиции в PLAN[day].ex, а порядок слотов в
 * PROGRAM повторяет PLAN один в один — поэтому сопоставление позиционное
 * и однозначное. Это работает ровно один раз, до первой правки состава дня;
 * после неё v0-данных уже не будет.
 */
import type { Cycle, SetLog, State } from './model';
import { logKey } from './model';
import { PROGRAM, PROGRAM_BASES } from './program';

export interface V0Entry {
  w?: number | null;
  s?: boolean[];
  d?: 'easy' | 'ok' | 'hard';
  n?: string;
}

export interface V0State {
  week?: number;
  day?: number;
  log?: Record<string, Record<string, V0Entry>>;
}

export interface MigrationReport {
  state: State;
  moved: number;
  skippedEmpty: number;
  unmatched: string[];
}

const DAY_KEY = /^w(\d+)d(\d+)$/;

/** Пустой скелет: ни одного отмеченного подхода и нет веса. */
const isEmpty = (e: V0Entry): boolean =>
  (e.w == null) && (!e.s || e.s.filter(Boolean).length === 0);

export const migrate = (
  v0: V0State,
  opts: { startedAt: string; cycleId?: string },
): MigrationReport => {
  const log: Record<string, SetLog> = {};
  const unmatched: string[] = [];
  let moved = 0;
  let skippedEmpty = 0;

  for (const [dayKey, entries] of Object.entries(v0.log ?? {})) {
    const m = DAY_KEY.exec(dayKey);
    if (!m) {
      unmatched.push(dayKey);
      continue;
    }
    const week = Number(m[1]);
    const dayIndex = Number(m[2]);
    const day = PROGRAM.days[dayIndex];

    if (!day || week < 1 || week > PROGRAM.weeks) {
      unmatched.push(dayKey);
      continue;
    }

    for (const [idx, entry] of Object.entries(entries ?? {})) {
      const slot = day.slots[Number(idx)];
      if (!slot) {
        /* Упражнение из v0, которого в программе больше нет: терять молча нельзя. */
        unmatched.push(`${dayKey}[${idx}]`);
        continue;
      }
      if (isEmpty(entry)) {
        skippedEmpty++;
        continue;
      }
      const out: SetLog = {
        weight: entry.w ?? null,
        sets: (entry.s ?? []).map(Boolean),
      };
      if (entry.d) out.difficulty = entry.d;
      if (entry.n) out.note = entry.n;
      log[logKey(week, slot.id)] = out;
      moved++;
    }
  }

  const cycle: Cycle = {
    id: opts.cycleId ?? 'c1',
    programId: PROGRAM.id,
    startedAt: opts.startedAt,
    bases: { ...PROGRAM_BASES },
    log,
  };

  const week = v0.week && v0.week >= 1 && v0.week <= PROGRAM.weeks ? v0.week : 1;
  const day = v0.day != null && v0.day >= 0 && v0.day < PROGRAM.days.length ? v0.day : 0;

  return {
    state: {
      version: 1,
      profile: { unit: 'kg' },
      cycles: [cycle],
      currentCycleId: cycle.id,
      week,
      day,
    },
    moved,
    skippedEmpty,
    unmatched,
  };
};
