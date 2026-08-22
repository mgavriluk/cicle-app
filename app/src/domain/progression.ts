/**
 * Прогрессия. Чистые функции над циклом — ни Angular, ни хранилища,
 * поэтому проверяются в node без браузера.
 *
 * Правила взяты из программы и не меняются без причины:
 *  · автоприбавка только там, где у слота задан `step`;
 *  · без `step` вес прошлой недели переносится как есть (двойная прогрессия
 *    идёт по повторениям, отсюда диапазоны вида 12–15);
 *  · два провала подряд на одном весе → минус 7,5 кг.
 */
import type { Cycle, Program, SetLog, Slot } from './model';
import { findSlot, logKey } from './model';

/** Блины позволяют шаг 1,25 кг — мельче округлять нет смысла. */
export const roundToPlate = (kg: number): number => Math.round(kg / 1.25) * 1.25;

export const isComplete = (entry: SetLog | undefined, slot: Slot): boolean =>
  !!entry && entry.sets.filter(Boolean).length >= slot.sets;

export const isFailed = (entry: SetLog | undefined, slot: Slot): boolean =>
  !!entry && entry.sets.length > 0 && entry.sets.filter(Boolean).length < slot.sets;

/**
 * Подсказка веса на неделю. Шагает назад до первого известного веса
 * и экстраполирует шагом слота — так пропущенная неделя не обнуляет прогресс.
 * Возвращает null для слотов, где вес не отслеживается.
 */
export const suggest = (
  cycle: Cycle,
  program: Program,
  week: number,
  slotId: string,
): number | null => {
  const slot = findSlot(program, slotId);
  if (!slot) return null;
  const step = slot.step ?? 0;

  for (let k = week; k >= 1; k--) {
    const entry = cycle.log[logKey(k, slotId)];
    if (entry && entry.weight != null) {
      return k === week ? entry.weight : roundToPlate(entry.weight + step * (week - k));
    }
  }

  const base = cycle.bases[slotId];
  return base != null ? roundToPlate(base + step * (week - 1)) : null;
};

export interface Stall {
  weight: number;
  weeks: [number, number];
  suggested: number;
}

/**
 * Застой: две последние заполненные недели провалены на одном и том же весе.
 * Возвращает предложение отката — применять или нет, решает пользователь,
 * потому что причина провала бывает вне лога (сон, еда, травма).
 */
export const stall = (
  cycle: Cycle,
  program: Program,
  week: number,
  slotId: string,
): Stall | null => {
  const slot = findSlot(program, slotId);
  if (!slot || !slot.step) return null;

  const filled: Array<{ week: number; entry: SetLog }> = [];
  for (let k = week - 1; k >= 1 && filled.length < 2; k--) {
    const entry = cycle.log[logKey(k, slotId)];
    if (entry && entry.sets.length > 0) filled.push({ week: k, entry });
  }
  if (filled.length < 2) return null;

  const [last, prev] = filled;
  if (last.entry.weight == null || last.entry.weight !== prev.entry.weight) return null;
  if (!isFailed(last.entry, slot) || !isFailed(prev.entry, slot)) return null;

  return {
    weight: last.entry.weight,
    weeks: [prev.week, last.week],
    suggested: roundToPlate(Math.max(0, last.entry.weight - 7.5)),
  };
};

export type DayStatus = 'empty' | 'partial' | 'full';

export const dayStatus = (
  cycle: Cycle,
  program: Program,
  week: number,
  dayIndex: number,
): DayStatus => {
  const day = program.days[dayIndex];
  if (!day) return 'empty';
  let touched = 0;
  let complete = 0;
  for (const slot of day.slots) {
    const entry = cycle.log[logKey(week, slot.id)];
    if (entry && entry.sets.some(Boolean)) touched++;
    if (isComplete(entry, slot)) complete++;
  }
  if (touched === 0) return 'empty';
  return complete === day.slots.length ? 'full' : 'partial';
};

export const progress = (cycle: Cycle, program: Program): { done: number; total: number } => {
  let done = 0;
  for (let week = 1; week <= program.weeks; week++) {
    for (let d = 0; d < program.days.length; d++) {
      if (dayStatus(cycle, program, week, d) === 'full') done++;
    }
  }
  return { done, total: program.weeks * program.days.length };
};

/** Лучший вес, взятый чисто: все запланированные подходы закрыты. */
export const bestClean = (cycle: Cycle, program: Program, slotId: string): number | null => {
  const slot = findSlot(program, slotId);
  if (!slot) return null;
  let best: number | null = null;
  for (let week = 1; week <= program.weeks; week++) {
    const entry = cycle.log[logKey(week, slotId)];
    if (entry && entry.weight != null && isComplete(entry, slot)) {
      if (best == null || entry.weight > best) best = entry.weight;
    }
  }
  return best;
};

/**
 * Базы для следующего цикла: минус 10% от чисто взятого,
 * чтобы первые недели шли на разгон, а не в отказ.
 * Слот, по которому нечего считать, сохраняет прежнюю базу.
 */
export const nextCycleBases = (
  cycle: Cycle,
  program: Program,
): Record<string, number> => {
  const bases: Record<string, number> = { ...cycle.bases };
  for (const day of program.days) {
    for (const slot of day.slots) {
      if (!slot.step) continue;
      const best = bestClean(cycle, program, slot.id);
      if (best != null) bases[slot.id] = roundToPlate(best * 0.9);
    }
  }
  return bases;
};
