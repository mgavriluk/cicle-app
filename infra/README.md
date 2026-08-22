# Инфраструктура РАЗГОН

## Создано

| Ресурс | Значение |
|---|---|
| Подписка | `Azure sub` (личный аккаунт, не корпоративный) |
| Группа ресурсов | `razgon-rg` |
| Cosmos DB | `razgon-cosmos`, API for NoSQL, регион `polandcentral` |
| Endpoint | `https://razgon-cosmos.documents.azure.com:443/` |
| База / контейнер | `razgon` / `data`, ключ раздела `/userId` |
| Тариф | free tier, 1000 RU/s на уровне базы, `totalThroughputLimit: 1000` |

Endpoint не секрет — доступ даёт не он, а токен. Ключи аккаунта нигде не хранятся
и не нужны: Functions ходят в Cosmos через managed identity и RBAC плоскости данных.

## Ловушка портала: список регионов врёт

Мастер создания Cosmos на этой подписке предлагает в поле Location **только
канареечные регионы** (`East US 2 EUAP`, `Central US EUAP`), причём создание в них
падает с `LocationNotAvailableForResourceType` — то есть портал показывает варианты,
которые сам провайдер отвергает. Смена Workload Type на список не влияет.

Обход: разворачивать через `cosmos.json` — портал → **Deploy a custom template** →
Build your own template in the editor. Регион передаётся параметром, провайдер его
принимает. Список реально доступных регионов возвращает сам провайдер в тексте
ошибки — он авторитетнее дропдауна.

Не тратить время на дропдаун при создании следующих ресурсов: сразу шаблон.

## Ещё не создано

- Container Apps environment + приложение
- Azure Functions (API между SPA и Cosmos)
- Тенант Entra External ID, регистрация SPA, Google как внешний провайдер
- Federated credentials для GitHub Actions (деплой без секретов)

## Отложено осознанно

**Ключи Cosmos пока включены** (`disableLocalAuth: false`). Data Explorer в портале
ходит через ключи, и без них не посмотреть данные глазами. Отключить на фазе 4,
когда managed identity заработает — тогда у аккаунта не останется ни одного
способа доступа по секрету.

**Sign in with Apple** требует Apple Developer Program, 99 $ в год. Для PWA
не обязателен. Отложено до того, как появится платный аккаунт разработчика.
