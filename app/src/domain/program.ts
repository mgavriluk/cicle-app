/**
 * Программа как данные, а не как константа в разметке.
 *
 * Содержимое перенесено один в один из PLAN в index.html: те же упражнения,
 * схемы, базы, время отдыха и цвета дней. Ничего не «улучшено» — программа
 * лечит конкретную проблему (много выносливости, мало максимальной силы),
 * и её правки требуют отдельного решения, а не заодно с переписыванием.
 *
 * Добавлены только устойчивые id слотов и паттерны движений: первое нужно,
 * чтобы история не ломалась, второе — чтобы упражнение в слоте можно было
 * заменить на равноценное.
 */
import type { Exercise, Pattern, Program } from './model';

/**
 * Библиотека. Первое упражнение каждого паттерна — то, что стоит в программе
 * по умолчанию; остальные — замены на тот же паттерн, чтобы изоляция
 * не приедалась за 12 недель. Базовые движения замен не имеют намеренно:
 * прогрессия на них — смысл программы.
 */
export const LIBRARY: Exercise[] = [
  { id: 'bench', name: 'Жим лёжа', pattern: 'жим-горизонт' },
  { id: 'squat', name: 'Присед со штангой', pattern: 'присед' },
  { id: 'deadlift', name: 'Становая тяга', pattern: 'тяга-с-пола' },
  { id: 'ohp', name: 'Жим стоя со штангой', pattern: 'жим-вертикаль' },

  { id: 'pullup-weighted', name: 'Подтягивания с весом', pattern: 'тяга-вертикаль', bodyweight: true },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока', pattern: 'тяга-вертикаль' },
  { id: 'chinup', name: 'Подтягивания обратным хватом', pattern: 'тяга-вертикаль', bodyweight: true },

  { id: 'row-barbell', name: 'Тяга штанги в наклоне', pattern: 'тяга-горизонт' },
  { id: 'row-dumbbell', name: 'Тяга гантели в наклоне', pattern: 'тяга-горизонт' },
  { id: 'row-cable', name: 'Тяга нижнего блока', pattern: 'тяга-горизонт' },
  { id: 'row-tbar', name: 'Тяга Т-грифа', pattern: 'тяга-горизонт' },

  { id: 'db-incline-press', name: 'Жим гантелей под углом', pattern: 'жим-горизонт' },
  { id: 'db-flat-press', name: 'Жим гантелей лежа', pattern: 'жим-горизонт' },
  { id: 'dips', name: 'Отжимания на брусьях', pattern: 'жим-горизонт', bodyweight: true },

  { id: 'triceps-cable', name: 'Трицепс на блоке', pattern: 'трицепс' },
  { id: 'triceps-ext-cable', name: 'Разгибания на блоке (трицепс)', pattern: 'трицепс' },
  { id: 'triceps-french', name: 'Французский жим', pattern: 'трицепс' },
  { id: 'triceps-overhead', name: 'Разгибания из-за головы', pattern: 'трицепс' },

  { id: 'curl-barbell', name: 'Подъём на бицепс', pattern: 'бицепс' },
  { id: 'curl-hammer', name: 'Молот с гантелями', pattern: 'бицепс' },
  { id: 'curl-incline', name: 'Подъём на бицепс на наклонной', pattern: 'бицепс' },

  { id: 'rdl', name: 'Румынская тяга', pattern: 'бедро-заднее' },
  { id: 'leg-curl', name: 'Сгибания ног', pattern: 'бедро-заднее' },
  { id: 'hip-thrust', name: 'Подъём таза со штангой', pattern: 'бедро-заднее' },

  { id: 'lunges-db', name: 'Выпады с гантелями', pattern: 'квадрицепс' },
  { id: 'leg-press', name: 'Жим ногами', pattern: 'квадрицепс' },
  { id: 'split-squat', name: 'Болгарский выпад', pattern: 'квадрицепс' },
  { id: 'goblet-squat', name: 'Присед с гантелью', pattern: 'квадрицепс' },

  { id: 'plank', name: 'Планка', pattern: 'пресс', bodyweight: true },
  { id: 'hanging-leg-raise', name: 'Подъём ног в висе', pattern: 'пресс', bodyweight: true },
  { id: 'ab-wheel', name: 'Колесо для пресса', pattern: 'пресс', bodyweight: true },
  { id: 'deadbug', name: 'Мёртвый жук', pattern: 'пресс', bodyweight: true },
];

export const exerciseById = (id: string): Exercise => {
  const found = LIBRARY.find((e) => e.id === id);
  if (!found) throw new Error(`нет упражнения ${id}`);
  return found;
};

export const alternatives = (pattern: Pattern): Exercise[] =>
  LIBRARY.filter((e) => e.pattern === pattern);

export const PROGRAM: Program = {
  id: 'razgon-12',
  name: 'Разгон · 12 недель',
  weeks: 12,
  days: [
    {
      index: 0,
      name: 'Верх',
      kind: 'тяжёлый',
      accent: 'red',
      slots: [
        { id: 'd1s1', pattern: 'жим-горизонт', exerciseId: 'bench', sets: 5, reps: '3', restSec: 270, key: true, step: 2.5 },
        { id: 'd1s2', pattern: 'тяга-вертикаль', exerciseId: 'pullup-weighted', sets: 4, reps: '5–8', restSec: 180 },
        { id: 'd1s3', pattern: 'жим-вертикаль', exerciseId: 'ohp', sets: 3, reps: '5', restSec: 180, key: true, step: 1.25 },
        { id: 'd1s4', pattern: 'тяга-горизонт', exerciseId: 'row-barbell', sets: 4, reps: '6–8', restSec: 150 },
        { id: 'd1s5', pattern: 'трицепс', exerciseId: 'triceps-cable', sets: 3, reps: '12–15', restSec: 75 },
      ],
    },
    {
      index: 1,
      name: 'Низ',
      kind: 'тяжёлый',
      accent: 'red',
      slots: [
        { id: 'd2s1', pattern: 'присед', exerciseId: 'squat', sets: 5, reps: '3', restSec: 270, key: true, step: 2.5 },
        { id: 'd2s2', pattern: 'бедро-заднее', exerciseId: 'rdl', sets: 3, reps: '8–10', restSec: 150 },
        { id: 'd2s3', pattern: 'квадрицепс', exerciseId: 'lunges-db', sets: 3, reps: '10–12', restSec: 120 },
        { id: 'd2s4', pattern: 'пресс', exerciseId: 'plank', sets: 3, reps: '45 сек', restSec: 60 },
      ],
    },
    {
      index: 2,
      name: 'Верх',
      kind: 'объём',
      accent: 'blue',
      slots: [
        { id: 'd3s1', pattern: 'жим-горизонт', exerciseId: 'bench', sets: 4, reps: '6', restSec: 180, key: true, step: 2.5 },
        { id: 'd3s2', pattern: 'жим-горизонт', exerciseId: 'db-incline-press', sets: 3, reps: '10–12', restSec: 120 },
        { id: 'd3s3', pattern: 'трицепс', exerciseId: 'triceps-ext-cable', sets: 3, reps: '12–15', restSec: 90 },
        { id: 'd3s4', pattern: 'тяга-вертикаль', exerciseId: 'lat-pulldown', sets: 4, reps: '10–12', restSec: 105 },
        { id: 'd3s5', pattern: 'тяга-горизонт', exerciseId: 'row-dumbbell', sets: 3, reps: '12–15', restSec: 90 },
        { id: 'd3s6', pattern: 'бицепс', exerciseId: 'curl-barbell', sets: 3, reps: '12–15', restSec: 75 },
      ],
    },
    {
      index: 3,
      name: 'Низ + пресс',
      kind: 'объём',
      accent: 'blue',
      slots: [
        { id: 'd4s1', pattern: 'тяга-с-пола', exerciseId: 'deadlift', sets: 4, reps: '4', restSec: 270, key: true, step: 5 },
        { id: 'd4s2', pattern: 'квадрицепс', exerciseId: 'leg-press', sets: 3, reps: '12–15', restSec: 120 },
        { id: 'd4s3', pattern: 'бедро-заднее', exerciseId: 'leg-curl', sets: 3, reps: '12–15', restSec: 90 },
        { id: 'd4s4', pattern: 'пресс', exerciseId: 'hanging-leg-raise', sets: 4, reps: '12–15', restSec: 75 },
        { id: 'd4s5', pattern: 'пресс', exerciseId: 'ab-wheel', sets: 3, reps: '10–12', restSec: 75 },
      ],
    },
  ],
};

/** Стартовые веса программы. Второй цикл получает свои, посчитанные из первого. */
export const PROGRAM_BASES: Record<string, number> = {
  d1s1: 65,
  d1s3: 40,
  d2s1: 80,
  d3s1: 57.5,
  d4s1: 100,
};
