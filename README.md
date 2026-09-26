# Travel Weave

Планировщик путешествий на интерактивном 3D-глобусе. Ты не заполняешь таблицы, а «плетёшь»
маршрут: ставишь точки на глобусе, соединяешь их светящимися нитями (перелёт, поезд, авто,
круиз, пешком), и приложение превращает это в живой маршрут с датами, таймлайном и бюджетом.

![стек](https://img.shields.io/badge/Angular-19-dd0031) ![three](https://img.shields.io/badge/Three.js-0.186-049ef4) ![firebase](https://img.shields.io/badge/Firebase-11-ffca28) ![pwa](https://img.shields.io/badge/PWA-да-3fd8c7)

## Что уже умеет (итерация 2)

- **Обычная карта** — Leaflet + OpenStreetMap, зум от мира до отдельных домов и дорог
  (уровень 19), светлая «бумажная» тема.
- **Плетение маршрута** — клик по карте сразу ставит точку (обратный геокодинг называет
  место), поиск городов (Open-Meteo); маркеры можно перетаскивать; нити пяти видов
  транспорта с изгибами, у перелётов бегут точки-искры; drag-n-drop в списке переплетает
  маршрут заново.
- **Точки и нити** — даты прибытия/отъезда, заметки, расстояния между точками, цена сегмента.
- **Таймлайн** — лента дней поездки с блоками точек и расходами на каждый день; клик по дню
  подлетает камерой к точке.
- **Бюджет** — итоги по категориям (жильё/еда/транспорт/активности), расходы по дням с
  графиком, прогноз «≈ X в день».
- **Аккаунты и хранение** — вход по почте или Google, поездки сохраняются в Firestore
  автоматически (debounce ~1 с), доступ только у владельца (правила Firestore).
- **Фото точек** — сжатие в браузере и загрузка в Supabase Storage.
- **PWA** — ставится на телефон/десктоп, офлайн-кэш оболочки приложения и гео-запросов.

## Запуск для разработки

```bash
npm install
npm start          # http://localhost:4200
```

Тесты: `npm test` (ChromeHeadless: `npx ng test --watch=false --browsers=ChromeHeadless`).

## Настройка Firebase (почта/Google, Firestore, Hosting)

Проект уже подключён (`src/environments/environment.ts`), но нужно включить сервисы:

1. [Firebase Console](https://console.firebase.google.com/project/travel-weave) → **Authentication → Sign-in method**:
   включите **Email/Password** и **Google**.
2. **Firestore Database** — база уже создана. Правила доступа (`firestore.rules`) уже
   деплоятся командой ниже: читать и писать может только владелец поездки.
3. Деплой правил и хостинга:

```bash
npx firebase-tools login              # один раз
npx firebase-tools deploy             # hosting + firestore rules/indexes
```

Прод-сборка: `npm run build` (лежит в `dist/travel-weave/browser`).

## Настройка Supabase (фото)

Firebase Storage требует платный план Blaze, поэтому файлы хранятся в бесплатном
Supabase Storage:

1. Создайте проект на [supabase.com](https://supabase.com).
2. **Storage → New bucket**: имя `travel-weave`, публичный доступ (public).
3. **Project Settings → API**: скопируйте `Project URL` и `anon public key`.
4. Вставьте их в `src/environments/environment.ts` и `environment.development.ts`:

```ts
supabase: {
  url: 'https://XXXX.supabase.co',
  anonKey: 'eyJhbGciOi…',
  bucket: 'travel-weave',
},
```

Пока ключи не заданы, загрузка фото показывает понятную подсказку, остальное работает.
Для публичных бакетов Supabase применяет RLS-политики; для anon-загрузки добавьте в
Storage → Policies правило `storage.objects`: `allow select, insert, update, delete for anon`
с проверкой пути `trips/*` (или ограничьте вставку своей логикой позже, вместе с правками
коллаборации).

## Структура

```
src/app/
  core/
    models.ts           # Trip, Waypoint, RouteSegment, StoredFile
    geo.ts              # расстояния, изогнутые пути нитей
    geocode.ts          # обратный геокодинг клика по карте
    budget.service.ts   # категория/день/прогноз расходов
    trip.store.ts       # сигнальное состояние маршрута (reweave нитей)
    auth.service.ts     # Firebase Auth + профиль users/{uid}
    trips.service.ts    # CRUD поездок в Firestore
    storage.service.ts  # Supabase Storage + компрессия фото
  map/
    map-scene.ts        # движок карты: маркеры, нити, изгиб дуг
    map.component.ts    # мост сигналы ↔ карта, клик-добавление
  ui/
    route-panel.component.ts   # поиск, DnD-список, карточки точек и нитей
    timeline.component.ts      # лента дней
    budget-panel.component.ts  # бюджет и график
    auth-screen.component.ts   # вход/регистрация
    trips-list.component.ts    # список поездок
```

Модель данных: `trips/{id}` — `{ ownerId, title, currency, waypoints[], segments[] }`;
порядок в `waypoints` — порядок маршрута, `segments[i]` соединяет точки `i` и `i+1`.

## Дальше (план итераций)

Погода и события в точках, коллаборация real-time (курсоры друзей, голосование), дневник
путешествий, режим «Мечта» с публичными маршрутами, голосовой ввод, импорт GPX, оптимизатор
маршрута и визовый слой.
