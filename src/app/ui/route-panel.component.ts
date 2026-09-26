import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { TRANSPORT_LABELS, TransportType, Waypoint } from '../core/models';
import { distanceKm } from '../core/geo';
import { RoutingService } from '../core/routing.service';
import { StorageService } from '../core/storage.service';
import { AuthService } from '../core/auth.service';
import { TripStore } from '../core/trip.store';

interface GeoResult {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

const TRANSPORT_ICONS: Record<TransportType, string> = {
  flight: '✈️',
  train: '🚆',
  car: '🚗',
  cruise: '🚢',
  walk: '🚶',
};

@Component({
  selector: 'app-route-panel',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="panel">
      <header>
        <div class="brand">Travel Weave</div>
        <input
          class="trip-title"
          placeholder="Название путешествия"
          [ngModel]="store.trip()?.title"
          (ngModelChange)="store.setMeta({ title: $event })"
        />
      </header>

      <div class="search">
        <input
          type="search"
          placeholder="Найти город…"
          [ngModel]="query()"
          (ngModelChange)="onSearch($event)"
        />
        @if (results().length) {
          <ul class="results">
            @for (r of results(); track r.latitude + ':' + r.longitude) {
              <li (click)="addFromSearch(r)">
                <span class="r-name">{{ r.name }}</span>
                <span class="r-country">{{ r.admin1 || r.country }}</span>
              </li>
            }
          </ul>
        }
      </div>

      <div class="route">
        @for (wp of store.waypoints(); track wp.id; let i = $index) {
          <!-- Нить между точками -->
          @if (i > 0) {
            @if (store.segments()[i - 1]; as seg) {
              <div class="segment">
                <select
                  [ngModel]="seg.type"
                  (ngModelChange)="store.updateSegment(i - 1, { type: $event })"
                >
                  @for (t of transportTypes; track t) {
                    <option [value]="t">{{ icons[t] }} {{ labels[t] }}</option>
                  }
                </select>
                <span class="seg-info">
                  {{ segmentKm(i - 1) | number: '1.0-0' }} км
                </span>
                <input
                  class="seg-price"
                  type="number"
                  min="0"
                  placeholder="цена"
                  [ngModel]="seg.price"
                  (ngModelChange)="store.updateSegment(i - 1, { price: $event })"
                />
              </div>
            }
          }

          <!-- Точка маршрута -->
          <div
            class="waypoint"
            [class.selected]="store.selectedIndex() === i"
            draggable="true"
            (dragstart)="onDragStart(i, $event)"
            (dragover)="$event.preventDefault()"
            (drop)="onDrop(i, $event)"
            (click)="select(i)"
          >
            <div class="wp-head">
              <span class="wp-num">{{ i + 1 }}</span>
              <span class="wp-name">{{ wp.name }}</span>
              <button
                type="button"
                class="icon-btn"
                (click)="remove(i, $event)"
                title="Убрать точку"
              >
                ✕
              </button>
            </div>

            @if (store.selectedIndex() === i) {
              <div class="wp-body" (click)="$event.stopPropagation()">
                <label>
                  Прибытие
                  <input
                    type="date"
                    [ngModel]="wp.arrival"
                    (ngModelChange)="store.updateWaypoint(wp.id, { arrival: $event })"
                  />
                </label>
                <label>
                  Отъезд
                  <input
                    type="date"
                    [ngModel]="wp.departure"
                    (ngModelChange)="store.updateWaypoint(wp.id, { departure: $event })"
                  />
                </label>
                <label>
                  Заметка
                  <textarea
                    rows="2"
                    placeholder="Что посмотреть, где жить…"
                    [ngModel]="wp.note"
                    (ngModelChange)="store.updateWaypoint(wp.id, { note: $event })"
                  ></textarea>
                </label>
                <div class="budget-grid">
                  <label>Жильё<input type="number" min="0" [ngModel]="wp.budget.stay"
                    (ngModelChange)="patchBudget(wp.id, 'stay', $event)" /></label>
                  <label>Еда<input type="number" min="0" [ngModel]="wp.budget.food"
                    (ngModelChange)="patchBudget(wp.id, 'food', $event)" /></label>
                  <label>Транспорт<input type="number" min="0" [ngModel]="wp.budget.transport"
                    (ngModelChange)="patchBudget(wp.id, 'transport', $event)" /></label>
                  <label>Активности<input type="number" min="0" [ngModel]="wp.budget.activities"
                    (ngModelChange)="patchBudget(wp.id, 'activities', $event)" /></label>
                </div>
                <div class="hint">суммы в сутки, {{ store.currency() }}</div>
                <div class="photo-row">
                  @if (wp.photo; as photo) {
                    <img class="photo" [src]="photo.url" alt="{{ wp.name }}" (click)="$event.stopPropagation()" />
                    <button type="button" class="icon-btn" (click)="removePhoto(wp, $event)" title="Убрать фото">
                      ✕
                    </button>
                  } @else {
                    <label class="photo-add">
                      📷 {{ uploading() ? 'Загружаю…' : 'Фото точки' }}
                      <input type="file" accept="image/*" hidden (change)="onPhoto($event, wp.id)" />
                    </label>
                  }
                </div>
              </div>
            }
          </div>
        } @empty {
          <div class="empty">
            Пустое полотно. Найди город или включи режим добавления и кликни по глобусу —
            нити сплетутся сами.
          </div>
        }
      </div>
    </div>
  `,
  styles: /* less */ `
    :host {
      position: absolute;
      top: 16px;
      left: 16px;
      bottom: 110px;
      width: 320px;
      z-index: 10;
      display: flex;
      pointer-events: none;
    }
    .panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 6px 28px rgba(20, 50, 80, 0.12);
      overflow: hidden;
      pointer-events: auto;
    }
    header {
      padding: 14px 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .brand {
      font-family: var(--font-display);
      font-size: 15px;
      letter-spacing: 0.08em;
      color: var(--gold);
    }
    .trip-title {
      font-weight: 600;
    }
    .search {
      position: relative;
      padding: 10px 14px 4px;
      input {
        width: 100%;
        box-sizing: border-box;
      }
    }
    .results {
      position: absolute;
      left: 14px;
      right: 14px;
      z-index: 20;
      margin: 4px 0 0;
      padding: 4px;
      list-style: none;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 10px;
      max-height: 220px;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(20, 50, 80, 0.16);
      li {
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        gap: 8px;
        &:hover {
          background: var(--teal-soft);
        }
        .r-name {
          font-weight: 600;
        }
        .r-country {
          color: var(--text-dim);
          font-size: 12px;
        }
      }
    }
    .route {
      flex: 1;
      overflow-y: auto;
      padding: 8px 14px 14px;
    }
    .waypoint {
      border: 1px solid var(--border);
      border-radius: 12px;
      margin: 6px 0;
      background: rgba(255, 255, 255, 0.75);
      cursor: pointer;
      transition: border-color 0.2s;
      &:hover {
        border-color: rgba(14, 148, 136, 0.55);
      }
      &.selected {
        border-color: var(--gold);
        box-shadow: 0 0 0 1px var(--gold-soft);
      }
    }
    .wp-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 10px;
    }
    .wp-num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--teal-soft);
      color: var(--teal);
      font-size: 12px;
      font-weight: 700;
      display: grid;
      place-items: center;
      flex: none;
    }
    .wp-name {
      flex: 1;
      font-weight: 600;
    }
    .icon-btn {
      border: none;
      background: none;
      color: var(--text-dim);
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
      &:hover {
        color: var(--danger);
        background: rgba(214, 69, 69, 0.08);
      }
    }
    .wp-body {
      padding: 2px 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: default;
      label {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 11px;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
    }
    .budget-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .hint {
      font-size: 11px;
      color: var(--text-dim);
    }
    .photo-row {
      display: flex;
      align-items: center;
      gap: 8px;
      .photo {
        width: 100%;
        height: 110px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--border);
      }
      .photo-add {
        width: 100%;
        text-align: center;
        padding: 10px;
        border: 1px dashed rgba(14, 148, 136, 0.45);
        border-radius: 10px;
        color: var(--text-dim);
        font-size: 12.5px;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
        &:hover {
          border-color: var(--teal);
          color: var(--teal);
        }
      }
    }
    .segment {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 4px 2px 24px;
      select {
        font-size: 12px;
        padding: 4px 6px;
      }
      .seg-info {
        flex: 1;
        font-size: 11px;
        color: var(--text-dim);
        white-space: nowrap;
      }
      .seg-price {
        width: 76px;
        font-size: 12px;
        padding: 4px 6px;
      }
    }
    .empty {
      padding: 24px 12px;
      color: var(--text-dim);
      text-align: center;
      line-height: 1.5;
      font-size: 13px;
    }
  `,
})
export class RoutePanelComponent {
  readonly store = inject(TripStore);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly routing = inject(RoutingService);

  readonly labels = TRANSPORT_LABELS;
  readonly icons = TRANSPORT_ICONS;
  readonly transportTypes: TransportType[] = ['flight', 'train', 'car', 'cruise', 'walk'];

  readonly query = signal('');
  readonly results = signal<GeoResult[]>([]);
  readonly uploading = signal(false);
  private dragFrom: number | null = null;
  private readonly search$ = new Subject<string>();

  constructor() {
    this.search$
      .pipe(
        debounceTime(320),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < 2) {
            return of<GeoResult[]>([]);
          }
          return this.geocode(q.trim());
        }),
        takeUntilDestroyed(),
      )
      .subscribe((res) => this.results.set(res as GeoResult[]));
  }

  onSearch(q: string): void {
    this.query.set(q);
    this.search$.next(q);
  }

  addFromSearch(r: GeoResult): void {
    this.store.addPoint(r.latitude, r.longitude, r.name, r.country);
    // Подлетаем камерой к новой точке.
    this.store.select(this.store.waypoints().length - 1);
    this.results.set([]);
    this.query.set('');
  }

  select(i: number): void {
    this.store.select(this.store.selectedIndex() === i ? null : i);
  }

  remove(i: number, ev: Event): void {
    ev.stopPropagation();
    const wp = this.store.waypoints()[i];
    if (wp) {
      this.store.removeWaypoint(wp.id);
    }
  }

  onDragStart(i: number, ev: DragEvent): void {
    this.dragFrom = i;
    ev.dataTransfer?.setData('text/plain', String(i));
  }

  onDrop(to: number, ev: DragEvent): void {
    ev.preventDefault();
    if (this.dragFrom !== null && this.dragFrom !== to) {
      this.store.moveWaypoint(this.dragFrom, to);
    }
    this.dragFrom = null;
  }

  patchBudget(id: string, field: 'stay' | 'food' | 'transport' | 'activities', value: number): void {
    const wp = this.store.waypoints().find((w) => w.id === id);
    if (wp) {
      this.store.updateWaypoint(id, { budget: { ...wp.budget, [field]: value ?? 0 } });
    }
  }

  /** Расстояние нити: дорожное — если роутинг уже посчитал, иначе по прямой. */
  segmentKm(index: number): number {
    // Трекаем версию роутинга — расстояния обновятся, когда маршрут посчитается.
    this.routing.version();
    const wps = this.store.waypoints();
    const a = wps[index];
    const b = wps[index + 1];
    if (!a || !b) {
      return 0;
    }
    const type = this.store.segments()[index]?.type ?? 'flight';
    const key = this.routing.key(type, a, b);
    const routed = this.routing.cached(key)?.distanceKm;
    return routed ?? distanceKm(a, b);
  }

  /** Загрузка фото точки: компрессия на canvas → Supabase → ссылка в документ. */
  async onPhoto(ev: Event, waypointId: string): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    const uid = this.auth.user()?.uid;
    const tripId = this.store.trip()?.id;
    if (!uid || !tripId) {
      alert('Сначала откройте поездку');
      return;
    }
    if (!this.storage.configured) {
      alert(
        'Хранилище файлов ещё не настроено. Добавьте ключи Supabase в src/environments/environment.ts (см. README).',
      );
      return;
    }
    this.uploading.set(true);
    try {
      const blob = await this.storage.compressImage(file, 1400, 0.8);
      const safeName = file.name.replace(/[^\w.\-]+/g, '_') || 'photo.jpg';
      const path = `trips/${uid}/${tripId}/photos/${Date.now()}_${safeName}`;
      const stored = await this.storage.uploadFile(path, blob, 'image/jpeg');
      this.store.updateWaypoint(waypointId, { photo: stored });
    } catch (e) {
      console.error(e);
      alert('Не удалось загрузить фото');
    } finally {
      this.uploading.set(false);
    }
  }

  async removePhoto(wp: Waypoint, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (wp.photo) {
      await this.storage.deleteFile(wp.photo.path);
    }
    this.store.updateWaypoint(wp.id, { photo: null });
  }

  private geocode(q: string): Promise<GeoResult[]> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=ru&format=json`;
    return fetch(url)
      .then((r) => r.json() as Promise<{ results?: GeoResult[] }>)
      .then((d) => d.results ?? [])
      .catch(() => []);
  }
}
