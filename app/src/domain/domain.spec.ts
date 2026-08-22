// @vitest-environment node
/**
 * Проверки домена. Запуск: npm test
 *
 * Отдельно проверяется миграция настоящего лога, если он лежит рядом:
 * это единственный способ убедиться, что три недели истории переедут целыми.
 */
import { describe, it } from 'vitest';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import type { Cycle } from './model';
import { logKey } from './model';
import { LIBRARY, PROGRAM, PROGRAM_BASES, alternatives, exerciseById } from './program';
import { dayStatus, nextCycleBases, progress, stall, suggest } from './progression';
import { migrate } from './migrate';
import { fromItems, toItems } from './cosmos';
import type { StateRequest } from './cosmos';
import type { V0State } from './migrate';

describe('домен РАЗГОН', () => {


/* ─── Программа ─── */
it('программа согласована сама с собой', () => {
  const ids = new Set<string>();
  let slots = 0;
  for (const day of PROGRAM.days) {
    for (const slot of day.slots) {
      assert.ok(!ids.has(slot.id), `id слота ${slot.id} не уникален`);
      ids.add(slot.id);
      slots++;
      const ex = exerciseById(slot.exerciseId);
      assert.strictEqual(ex.pattern, slot.pattern,
        `${slot.id}: упражнение ${ex.id} не того паттерна`);
      assert.ok(slot.sets > 0 && slot.restSec > 0, `${slot.id}: пустая схема`);
    }
  }
  assert.strictEqual(slots, 20, 'в программе должно быть 20 слотов');
  assert.strictEqual(PROGRAM.weeks * PROGRAM.days.length, 48, 'цикл — 48 тренировок');

  for (const slotId of Object.keys(PROGRAM_BASES)) {
    assert.ok(ids.has(slotId), `база задана для несуществующего слота ${slotId}`);
  }
  const withStep = PROGRAM.days.flatMap((d) => d.slots).filter((s) => s.step);
  for (const slot of withStep) {
    assert.ok(PROGRAM_BASES[slot.id] != null,
      `${slot.id} имеет шаг, но не имеет базы — прогрессии не с чего начать`);
  }
  assert.ok(new Set(LIBRARY.map((e) => e.id)).size === LIBRARY.length, 'дубли в библиотеке');
  assert.ok(alternatives('трицепс').length >= 2, 'у трицепса нет замен');

});

/* ─── Прогрессия ─── */
it('подсказка веса', () => {
  const empty: Cycle = { id: 'c', programId: PROGRAM.id, startedAt: '2026-06-01', bases: { ...PROGRAM_BASES }, log: {} };

  assert.strictEqual(suggest(empty, PROGRAM, 1, 'd1s1'), 65, 'неделя 1 — база');
  assert.strictEqual(suggest(empty, PROGRAM, 3, 'd1s1'), 70, 'неделя 3 от базы: 65 + 2×2,5');
  assert.strictEqual(suggest(empty, PROGRAM, 12, 'd1s3'), 53.75, 'жим стоя: шаг 1,25 за 11 недель');
  assert.strictEqual(suggest(empty, PROGRAM, 4, 'd1s5'), null, 'у изоляции нет ни базы, ни шага');

  const withLog: Cycle = { ...empty, log: { [logKey(2, 'd1s1')]: { weight: 80, sets: [true, true, true, true, true] } } };
  assert.strictEqual(suggest(withLog, PROGRAM, 2, 'd1s1'), 80, 'своя неделя — как записано');
  assert.strictEqual(suggest(withLog, PROGRAM, 3, 'd1s1'), 82.5, 'от записанного, а не от базы');
  assert.strictEqual(suggest(withLog, PROGRAM, 5, 'd1s1'), 87.5, 'пропуск недель экстраполируется');

  /* Слот без шага переносит вес прошлой недели без изменений — это не баг. */
  const iso: Cycle = { ...empty, log: { [logKey(2, 'd1s5')]: { weight: 25, sets: [true, true, true] } } };
  assert.strictEqual(suggest(iso, PROGRAM, 5, 'd1s5'), 25, 'изоляция: вес переносится как есть');

});

/* ─── Застой и откат ─── */
it('застой и откат', () => {
  const base: Cycle = { id: 'c', programId: PROGRAM.id, startedAt: '2026-06-01', bases: { ...PROGRAM_BASES }, log: {} };
  const failed = { weight: 90, sets: [true, true, false] };

  const twice: Cycle = { ...base, log: { [logKey(4, 'd1s1')]: failed, [logKey(5, 'd1s1')]: failed } };
  const s = stall(twice, PROGRAM, 6, 'd1s1');
  if (!s) throw new Error('два провала подряд на одном весе — это застой');
  assert.strictEqual(s.suggested, 82.5, 'откат минус 7,5');
  assert.deepStrictEqual(s.weeks, [4, 5], 'не те недели');

  const once: Cycle = { ...base, log: { [logKey(5, 'd1s1')]: failed } };
  assert.strictEqual(stall(once, PROGRAM, 6, 'd1s1'), null, 'один провал — не застой');

  const different: Cycle = {
    ...base,
    log: { [logKey(4, 'd1s1')]: { weight: 85, sets: [true, false] }, [logKey(5, 'd1s1')]: failed },
  };
  assert.strictEqual(stall(different, PROGRAM, 6, 'd1s1'), null, 'разные веса — не застой');

  const cleanThenFail: Cycle = {
    ...base,
    log: { [logKey(4, 'd1s1')]: { weight: 90, sets: [true, true, true, true, true] }, [logKey(5, 'd1s1')]: failed },
  };
  assert.strictEqual(stall(cleanThenFail, PROGRAM, 6, 'd1s1'), null, 'чисто взятая неделя не считается провалом');

});

/* ─── Замена упражнения и порядок слотов ─── */
it('слоты переживают перестановку и замену', () => {
  const cycle: Cycle = {
    id: 'c', programId: PROGRAM.id, startedAt: '2026-06-01',
    bases: { ...PROGRAM_BASES },
    log: { [logKey(2, 'd1s1')]: { weight: 80, sets: [true, true, true, true, true] } },
  };
  const before = suggest(cycle, PROGRAM, 3, 'd1s1');

  /* Тот же баг, что был в index.html: там ключом был индекс, и вставка
     упражнения в начало дня сдвигала всю историю. Здесь — не должна. */
  const reordered = {
    ...PROGRAM,
    days: PROGRAM.days.map((d, i) =>
      i === 0 ? { ...d, slots: [d.slots[4], ...d.slots.slice(0, 4)] } : d),
  };
  assert.strictEqual(suggest(cycle, reordered, 3, 'd1s1'), before,
    'перестановка слотов не должна двигать историю');

  /* Замена упражнения в слоте: история слота остаётся. */
  const swapped = {
    ...PROGRAM,
    days: PROGRAM.days.map((d, i) =>
      i === 0 ? { ...d, slots: d.slots.map((s) => s.id === 'd1s4' ? { ...s, exerciseId: 'row-cable' } : s) } : d),
  };
  assert.strictEqual(exerciseById('row-cable').pattern, 'тяга-горизонт', 'замена того же паттерна');
  assert.strictEqual(suggest(cycle, swapped, 3, 'd1s1'), before, 'замена в другом слоте ни на что не влияет');

});

/* ─── Миграция настоящего лога ─── */
it('миграция v0 в v1 на настоящем логе', () => {
  const candidates = [
    'C:/Users/MaksymHavryliuk/Downloads/Telegram Desktop/cycle-backup.json',
    './cycle-backup.json',
  ];
  const found = candidates.find((p) => existsSync(p));

  if (!found) {

  } else {
    const raw = JSON.parse(readFileSync(found, 'utf8'));
    const v0: V0State = raw.S ?? raw;
    const rep = migrate(v0, { startedAt: '2026-08-01' });

    assert.deepStrictEqual(rep.unmatched, [], 'что-то не сопоставилось — данные потерялись бы');
    assert.ok(rep.moved > 0, 'ничего не перенесено');

    const cycle = rep.state.cycles[0];

    /* Точечно: жим лёжа, неделя 3, день 1 — в v0 это w3d0[0]. */
    const bench3 = cycle.log[logKey(3, 'd1s1')];
    assert.ok(bench3, 'жим лёжа недели 3 не доехал');
    assert.strictEqual(bench3.weight, 75, 'вес жима недели 3 изменился при переносе');
    assert.strictEqual(bench3.sets.filter(Boolean).length, 5, 'подходы жима недели 3 потерялись');

    /* Точечно: бицепс, неделя 3, день 3 — в v0 это w3d2[5], с заметкой и оценкой. */
    const curl = cycle.log[logKey(3, 'd3s6')];
    assert.ok(curl, 'бицепс недели 3 не доехал');
    assert.strictEqual(curl.difficulty, 'hard', 'оценка потерялась');
    assert.strictEqual(curl.note, '15 12 12', 'заметка потерялась');

    /* Провал на становой: 2 из 4 подходов на неделе 2. */
    const dl = cycle.log[logKey(2, 'd4s1')];
    assert.ok(dl, 'становая недели 2 не доехала');
    assert.strictEqual(dl.weight, 105, 'вес становой изменился');
    assert.strictEqual(dl.sets.filter(Boolean).length, 2, 'провал на становой должен сохраниться');

    assert.strictEqual(dayStatus(cycle, PROGRAM, 1, 0), 'full', 'неделя 1 день 1 закрыта целиком');
    assert.strictEqual(dayStatus(cycle, PROGRAM, 2, 3), 'partial', 'неделя 2 день 4 закрыта частично');
    assert.strictEqual(dayStatus(cycle, PROGRAM, 7, 0), 'empty', 'неделя 7 ещё не начата');

    const p = progress(cycle, PROGRAM);
    assert.strictEqual(p.total, 48, 'всего тренировок в цикле');
    assert.ok(p.done >= 1 && p.done <= 12, `закрытых тренировок ${p.done} — вне разумного`);

    /* Пустые скелеты будущих недель не должны переезжать. */
    assert.ok(rep.skippedEmpty > 20, `пустых записей отброшено ${rep.skippedEmpty}, ожидалось много`);
    assert.strictEqual(cycle.log[logKey(12, 'd1s1')], undefined, 'пустая неделя 12 переехала');

    /* Базы второго цикла: чисто взятое минус 10%. */
    const next = nextCycleBases(cycle, PROGRAM);
    assert.strictEqual(next['d1s1'], 67.5, 'жим: 75 чисто → база 67,5');
    assert.strictEqual(next['d4s1'], 100, 'становая: чистых недель нет → база прежняя');

  }
});


/* ─── Раскладка по Cosmos и сборка обратно ─── */
it('раскладка по Cosmos и сборка обратно', () => {
  const found = [
    'C:/Users/MaksymHavryliuk/Downloads/Telegram Desktop/cycle-backup.json',
    './cycle-backup.json',
  ].find((p) => existsSync(p));

  const state = found
    ? migrate((JSON.parse(readFileSync(found, 'utf8')).S ?? {}) as V0State, { startedAt: '2026-08-01' }).state
    : migrate({ week: 3, day: 2, log: { w1d0: { '0': { w: 65, s: [true, true, true, true, true] } } } }, { startedAt: '2026-08-01' }).state;

  const items = toItems(state, 'user-abc');
  assert.strictEqual(items.length, 3, 'профиль, указатель и один цикл');
  assert.ok(items.every((i) => i.userId === 'user-abc'), 'ключ раздела проставлен не везде');
  assert.ok(items.some((i) => i.id === 'cycle:c1'), 'цикл лежит не под тем id');

  /* Круговой обход: то, что уехало в базу, должно вернуться байт в байт. */
  assert.deepStrictEqual(fromItems(items), state, 'состояние не выжило круговой обход через Cosmos');

  /* Порядок страниц в ответе Cosmos не гарантирован. */
  assert.deepStrictEqual(fromItems([...items].reverse()), state, 'сборка зависит от порядка элементов');

  /* Указатель на несуществующий цикл: берём последний, а не падаем. */
  const broken = items.map((i) => i.type === 'pointer' ? { ...i, currentCycleId: 'нет-такого' } : i);
  assert.strictEqual(fromItems(broken).currentCycleId, 'c1', 'потерянный указатель не должен ронять доступ к логу');

  /* Раздел без циклов — это ошибка, а не пустое состояние: молча начать с нуля
     поверх существующей истории хуже, чем упасть. */
  assert.throws(() => fromItems(items.filter((i) => i.type !== 'cycle')), /нет ни одного цикла/);

  /* В теле запроса не должно быть userId: сервер берёт его из токена. */
  const body: StateRequest = {
    profile: state.profile, cycles: state.cycles, currentCycleId: state.currentCycleId,
    week: state.week, day: state.day, etags: {},
  };
  assert.ok(!('userId' in body), 'userId просочился в контракт запроса');

});


});
