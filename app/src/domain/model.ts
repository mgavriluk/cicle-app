/**
 * Модель данных РАЗГОН, версия 1.
 *
 * Три отличия от того, что было в index.html, и каждое закрывает конкретную дыру:
 *
 * 1. Цикл — сущность. Раньше лог был плоским, второй цикл было некуда положить.
 * 2. Лог привязан к слоту, а не к индексу упражнения в дне. Раньше вставка
 *    упражнения в середину дня сдвигала всю историю на позицию — молча.
 * 3. Профиль отдельно от программы. Раньше веса и цели были константами в коде,
 *    то есть приложение годилось ровно одному человеку.
 */

/** Паттерн движения. Слот принимает любое упражнение своего паттерна. */
export type Pattern =
  | 'жим-горизонт'
  | 'жим-вертикаль'
  | 'тяга-горизонт'
  | 'тяга-вертикаль'
  | 'присед'
  | 'тяга-с-пола'
  | 'бедро-заднее'
  | 'квадрицепс'
  | 'трицепс'
  | 'бицепс'
  | 'пресс';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** Своим весом: поле веса не показывается. */
  bodyweight?: boolean;
}

/**
 * Слот — место в дне, а не упражнение. `id` устойчив навсегда:
 * именно по нему живёт история, поэтому переименование или замена
 * упражнения прогрессию не ломает.
 */
export interface Slot {
  id: string;
  pattern: Pattern;
  exerciseId: string;
  sets: number;
  reps: string;
  restSec: number;
  /** Ключевое движение дня: отдых длинный, прогрессия по весу. */
  key?: boolean;
  /** Шаг автоприбавки в кг. Нет шага — вес переносится без изменений. */
  step?: number;
}

export type DayKind = 'тяжёлый' | 'объём';

export interface Day {
  index: number;
  name: string;
  kind: DayKind;
  accent: 'red' | 'blue';
  slots: Slot[];
}

export interface Program {
  id: string;
  name: string;
  weeks: number;
  days: Day[];
}

export type Difficulty = 'easy' | 'ok' | 'hard';

export interface SetLog {
  weight: number | null;
  /** Отмеченные подходы. Длина равна числу выполненных, не запланированных. */
  sets: boolean[];
  difficulty?: Difficulty;
  note?: string;
  /**
   * Чем слот был закрыт фактически. Пусто — упражнением по умолчанию.
   * Позволяет менять упражнение, не теряя привязку истории к слоту.
   */
  exerciseId?: string;
}

/** Ключ: `${week}:${slotId}`, например `3:d1s1`. */
export type CycleLog = Record<string, SetLog>;

export interface Cycle {
  id: string;
  programId: string;
  /** YYYY-MM-DD в местном времени. */
  startedAt: string;
  finishedAt?: string;
  /** slotId → стартовый вес. Второй цикл начинается не с базы программы. */
  bases: Record<string, number>;
  log: CycleLog;
}

export interface Profile {
  bodyweight?: number;
  goal?: { slotId: string; target: number };
  unit: 'kg';
}

export interface State {
  version: 1;
  profile: Profile;
  cycles: Cycle[];
  currentCycleId: string;
  week: number;
  day: number;
}

export const logKey = (week: number, slotId: string): string => `${week}:${slotId}`;

export const findSlot = (program: Program, slotId: string): Slot | undefined => {
  for (const day of program.days) {
    const slot = day.slots.find((s) => s.id === slotId);
    if (slot) return slot;
  }
  return undefined;
};

export const currentCycle = (state: State): Cycle => {
  const cycle = state.cycles.find((c) => c.id === state.currentCycleId);
  if (!cycle) throw new Error(`нет цикла ${state.currentCycleId}`);
  return cycle;
};
