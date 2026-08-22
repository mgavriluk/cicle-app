/**
 * Раскладка состояния по элементам Cosmos DB и сборка обратно.
 *
 * Один контейнер, ключ раздела `/userId`. Раздел = пользователь, поэтому
 * изоляция данных совпадает с границей раздела, а не держится на условии в коде.
 *
 * Почему цикл — один элемент, а не элемент на тренировку: весь цикл это
 * порядка 20 КБ при лимите 2 МБ, точечное чтение стоит 1 RU, а бесплатный
 * тариф даёт 1000 RU/s. Отметка подхода перезаписывает элемент целиком —
 * при 40 записях в неделю это несущественно.
 * ponytail: если циклов станет много или запись подхода станет горячей —
 * дробить на элемент на (неделя, день), ключ раздела не меняется.
 *
 * `userId` не приходит от клиента никогда: его подставляет API из проверенного
 * токена. Поэтому в типах запросов его нет — забыть проверку негде.
 */
import type { Cycle, Profile, State } from './model';

export type ItemType = 'profile' | 'cycle' | 'pointer';

interface Base {
  id: string;
  userId: string;
  type: ItemType;
  /** Служебное поле Cosmos, используется для optimistic concurrency. */
  _etag?: string;
}

export interface ProfileItem extends Base {
  type: 'profile';
  profile: Profile;
}

export interface CycleItem extends Base {
  type: 'cycle';
  cycle: Cycle;
}

/** Где пользователь сейчас. Меняется при каждой навигации, поэтому отдельно от профиля. */
export interface PointerItem extends Base {
  type: 'pointer';
  currentCycleId: string;
  week: number;
  day: number;
}

export type Item = ProfileItem | CycleItem | PointerItem;

export const cycleItemId = (cycleId: string): string => `cycle:${cycleId}`;

export const toItems = (state: State, userId: string): Item[] => [
  { id: 'profile', userId, type: 'profile', profile: state.profile },
  { id: 'pointer', userId, type: 'pointer', currentCycleId: state.currentCycleId, week: state.week, day: state.day },
  ...state.cycles.map((cycle): CycleItem => ({
    id: cycleItemId(cycle.id),
    userId,
    type: 'cycle',
    cycle,
  })),
];

/**
 * Сборка состояния из раздела. Порядок элементов в ответе Cosmos не гарантирован,
 * поэтому циклы сортируются по дате старта — иначе «текущий» и история
 * зависели бы от порядка страниц.
 */
export const fromItems = (items: Item[]): State => {
  const profile = items.find((i): i is ProfileItem => i.type === 'profile');
  const pointer = items.find((i): i is PointerItem => i.type === 'pointer');
  const cycles = items
    .filter((i): i is CycleItem => i.type === 'cycle')
    .map((i) => i.cycle)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));

  if (!cycles.length) throw new Error('в разделе нет ни одного цикла');

  const currentCycleId = pointer?.currentCycleId ?? cycles[cycles.length - 1].id;
  const known = cycles.some((c) => c.id === currentCycleId);

  return {
    version: 1,
    profile: profile?.profile ?? { unit: 'kg' },
    cycles,
    /* Указатель на несуществующий цикл — берём последний, а не падаем:
       потерять «где я сейчас» не страшно, потерять доступ к логу — страшно. */
    currentCycleId: known ? currentCycleId : cycles[cycles.length - 1].id,
    week: pointer?.week ?? 1,
    day: pointer?.day ?? 0,
  };
};

/* ─── Контракт API ─── */

/** Ответ GET /api/state. `etag` возвращается для сравнения при записи. */
export interface StateResponse {
  state: State;
  etags: Record<string, string>;
}

/**
 * Тело PUT /api/state. `userId` отсутствует намеренно — сервер берёт его
 * из токена. `etags` — то, что было прочитано; несовпадение даёт 409,
 * и клиент перечитывает и накладывает правку заново.
 */
export interface StateRequest {
  profile: Profile;
  cycles: Cycle[];
  currentCycleId: string;
  week: number;
  day: number;
  etags: Record<string, string>;
}
