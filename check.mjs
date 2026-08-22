/* Проверки логики приложения. Запуск: node check.mjs
   Всё выдирается из index.html — проверяем то, что реально уехало на телефон. */
import {readFileSync} from 'fs';
import assert from 'assert';

const html = readFileSync('index.html', 'utf8');
const grab = (re, label) => {
  const m = html.match(re);
  assert(m, `не найден ${label} в index.html — поправь регулярку в check.mjs`);
  return m[0];
};

/* ─────────── 1. Прогрессия весов ─────────── */

let S = {week: 1, day: 0, log: {}};
const planSrc = grab(/const PLAN=\[[\s\S]*?\n\];/, 'PLAN')
              + grab(/const sid=[^\n]*/, 'sid')
              + grab(/function suggest\([\s\S]*?\n\}/, 'suggest');
const {PLAN, suggest} = new Function(`${planSrc}; return {PLAN, suggest};`)();
globalThis.S = S;

/* Один отмеченный подход должен зафиксировать вес: та же логика, что в обработчике подхода */
const tap = (w, d, i) => {
  const r = (S.log[`w${w}d${d}`] ??= {})[i] ??= {w: null, s: []};
  const sug = suggest(w, d, i);
  r.s[0] = true;
  if (r.s[0] && r.w == null && sug != null) r.w = sug;
  return r.w;
};

const ex = PLAN[0].ex.findIndex(e => e.step);
assert(ex >= 0, 'в дне 0 нет упражнения со step');
const step = PLAN[0].ex[ex].step;

const w1 = tap(1, 0, ex);
assert(w1 != null, 'неделя 1: вес не зафиксировался при отметке подхода');

S.week = 2;
assert.strictEqual(tap(2, 0, ex), w1 + step, 'неделя 2: прибавка не применилась');

S.week = 3;
assert.strictEqual(tap(3, 0, ex), w1 + step * 2, 'неделя 3: цепочка прогрессии оборвалась');

S.week = 5;   /* пропущенная неделя должна экстраполироваться, а не замирать */
assert.strictEqual(tap(5, 0, ex), w1 + step * 4, 'неделя 5 после пропуска 4-й: неверная экстраполяция');

console.log(`ok — вес фиксируется по отметке подхода, прогрессия ${w1} → ${w1 + step * 4} кг (+${step}/нед)`);

/* ─────────── 2. Синхронизация с репозиторием ─────────── */

const syncSrc = grab(/const SYNC=\{[\s\S]*?\n\};/, 'SYNC');

/* Стенд: фальшивый fetch вместо GitHub, S с кириллицей в заметке.
   MARK живёт в стенде, чтобы проверять флаг «есть неотправленное». */
const mk = (responses, mark = {at: 0, sent: 0}) => {
  const calls = [];
  const saved = [];
  const fetch = async (url, opt = {}) => {
    calls.push({url, method: opt.method || 'GET', body: opt.body ? JSON.parse(opt.body) : null,
                keepalive: !!opt.keepalive});
    const r = responses.shift();
    assert(r, `лишний запрос: ${opt.method || 'GET'} ${url}`);
    return {status: r.status, ok: r.status < 300, json: async () => r.json};
  };
  const state = {week: 3, day: 2, log: {w3d2: {0: {w: 62.5, s: [true], n: 'тяжело, 3 повтора'}}}};
  const MARK = mark;
  const ctx = {
    fetch, S: state, today: () => '2026-08-20',
    MARK, pend: () => MARK.at > MARK.sent, markSave: () => saved.push({...MARK}),
    document: {getElementById: () => ({textContent: '', value: ''})},
    TextEncoder, TextDecoder, btoa, atob, Date, JSON, Object,
    DB: {get: async () => null, set: async () => {}}
  };
  const args = Object.keys(ctx);
  const SYNC = new Function(...args, `${syncSrc}; return SYNC;`)(...args.map(k => ctx[k]));
  SYNC.cfg = {repo: 'mgavriluk/cicle-data', token: 'ghp_fake'};
  return {SYNC, calls, state, MARK, saved};
};

const b64 = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
const decode = (c) => JSON.parse(new TextDecoder().decode(
  Uint8Array.from(atob(c.replace(/[^A-Za-z0-9+/=]/g, '')), ch => ch.charCodeAt(0))));

/* Файла в репо ещё нет: pull отдаёт null, push создаёт без sha */
{
  const {SYNC, calls, state} = mk([
    {status: 404, json: {}},
    {status: 201, json: {content: {sha: 'sha1'}}}
  ]);
  assert.strictEqual(await SYNC.pull(), null, 'на 404 pull должен вернуть null, а не падать');
  await SYNC.push();
  const put = calls[1];
  assert.strictEqual(put.method, 'PUT', 'push должен делать PUT');
  assert(!('sha' in put.body), 'первая запись не должна нести sha');
  assert(put.keepalive, 'PUT без keepalive не доживёт до сворачивания приложения');

  const sent = decode(put.body.content);
  assert.deepStrictEqual(sent.S, state, 'улетело не то состояние');
  assert.strictEqual(sent.S.log.w3d2[0].n, 'тяжело, 3 повтора', 'кириллица в заметке побилась о base64');
  assert(sent.at > 0, 'нет метки времени');
  assert.strictEqual(SYNC.sha, 'sha1', 'sha после записи не запомнился');
}

/* Файл есть: pull разбирает содержимое, включая перенос строки внутри base64 от GitHub */
{
  const payload = {S: {week: 7, day: 1, log: {}}, at: 1};
  const raw = b64(payload);
  const {SYNC} = mk([{status: 200, json: {sha: 'shaX', content: raw.slice(0, 20) + '\n' + raw.slice(20)}}]);
  assert.deepStrictEqual(await SYNC.pull(), payload, 'pull не разобрал содержимое с переносом строки');
  assert.strictEqual(SYNC.sha, 'shaX', 'sha из pull не запомнился');
}

/* Устаревший sha: 409 → перечитать → записать поверх */
{
  const {SYNC, calls} = mk([
    {status: 409, json: {}},
    {status: 200, json: {sha: 'fresh', content: b64({S: {log: {}}, at: 1})}},
    {status: 200, json: {content: {sha: 'sha2'}}}
  ]);
  SYNC.sha = 'stale';
  await SYNC.push();
  assert.strictEqual(calls[0].body.sha, 'stale', 'первая попытка должна идти со старым sha');
  assert.strictEqual(calls[1].method, 'GET', 'после 409 нужно перечитать файл');
  assert.strictEqual(calls[2].body.sha, 'fresh', 'повтор ушёл не со свежим sha');
  assert.strictEqual(SYNC.sha, 'sha2', 'sha после повтора не обновился');
}

/* Флаг неотправленного: отправляется зафиксированная метка, после успеха флаг снимается */
{
  const {SYNC, calls, MARK, saved} = mk([{status: 200, json: {content: {sha: 's'}}}], {at: 1000, sent: 0});
  assert.strictEqual(MARK.at > MARK.sent, true, 'стенд начинается с неотправленного');
  await SYNC.push();
  assert.strictEqual(decode(calls[0].body.content).at, 1000, 'в репо ушла не та метка');
  assert.strictEqual(MARK.sent, 1000, 'после успешной отправки флаг не снялся');
  assert.strictEqual(MARK.at > MARK.sent, false, 'осталось «неотправленное» после успеха');
  assert.deepStrictEqual(saved, [{at: 1000, sent: 1000}], 'метка не сохранена в хранилище');
}

/* Сорванная отправка: флаг обязан остаться, иначе тренировка тихо потеряется */
{
  const {SYNC, MARK, saved} = mk([{status: 500, json: {}}], {at: 2000, sent: 0});
  await assert.rejects(() => SYNC.push(), /GitHub 500/, 'ошибка сети должна доходить до вызывающего');
  assert.strictEqual(MARK.sent, 0, 'флаг снят при неудачной отправке — так данные и теряются');
  assert.deepStrictEqual(saved, [], 'метку сохранять нечему: отправки не было');
}

/* Запись во время запроса не должна уехать помеченной как отправленная */
{
  const {SYNC, MARK} = mk([{status: 200, json: {content: {sha: 's'}}}], {at: 3000, sent: 0});
  const p = SYNC.push();
  MARK.at = 4000;                    /* отметил подход, пока PUT в полёте */
  await p;
  assert.strictEqual(MARK.sent, 3000, 'sent прыгнул на более позднюю метку — свежая запись потерялась бы');
  assert.strictEqual(MARK.at > MARK.sent, true, 'запись во время запроса должна остаться неотправленной');
}

/* Плохой токен — внятная ошибка, а не «GitHub 401» */
{
  const {SYNC} = mk([{status: 401, json: {}}]);
  await assert.rejects(() => SYNC.pull(), /токен не принят/, 'на 401 нужна понятная ошибка');
}

console.log('ok — синхронизация: создание, чтение, повтор при устаревшем sha, кириллица, флаг неотправленного');
