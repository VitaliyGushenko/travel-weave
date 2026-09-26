import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { TripsService } from '../core/trips.service';
import { Trip } from '../core/models';

@Component({
  selector: 'app-trips-list',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="backdrop">
      <div class="card">
        <h1>Мои путешествия</h1>

        <div class="new">
          <input
            type="text"
            placeholder="Куда сплетём путь?"
            [(ngModel)]="title"
            (keyup.enter)="create()"
          />
          <button type="button" (click)="create()" [disabled]="creating()">
            {{ creating() ? '…' : '＋ Новое' }}
          </button>
        </div>

        @if (trips() === undefined) {
          <div class="empty">Загружаю…</div>
        } @else if (trips()!.length === 0) {
          <div class="empty">
            Здесь появятся ваши маршруты. Начните с первого — найдите города или кликайте
            по глобусу.
          </div>
        } @else {
          <ul class="list">
            @for (t of sorted(); track t.id) {
              <li (click)="openTrip.emit(t.id!)">
                <div class="t-title">{{ t.title }}</div>
                <div class="t-meta">
                  {{ t.waypoints.length }} точек
                  @if (t.startDate || t.endDate) {
                    · {{ t.startDate || '…' }} — {{ t.endDate || '…' }}
                  }
                </div>
                <button
                  type="button"
                  class="del"
                  (click)="remove(t, $event)"
                  title="Удалить поездку"
                >
                  ✕
                </button>
              </li>
            }
          </ul>
        }

        <button type="button" class="logout" (click)="auth.logout()">Выйти</button>
      </div>
    </div>
  `,
  styles: /* less */ `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: grid;
      place-items: center;
      background:
        radial-gradient(ellipse 90% 60% at 50% -10%, rgba(124, 92, 214, 0.14), transparent 60%),
        radial-gradient(ellipse 80% 60% at 80% 110%, rgba(14, 148, 136, 0.12), transparent 55%),
        var(--bg);
    }
    .card {
      width: 400px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 28px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: 0 20px 60px rgba(20, 50, 80, 0.18);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      color: var(--gold);
      text-align: center;
    }
    .new {
      display: flex;
      gap: 8px;
      input {
        flex: 1;
      }
      button {
        border-radius: 10px;
        border: 1px solid var(--gold-soft);
        background: var(--gold-soft);
        color: #f2d9a0;
        font-weight: 700;
        cursor: pointer;
        padding: 8px 12px;
      }
    }
    .empty {
      color: var(--text-dim);
      text-align: center;
      font-size: 13px;
      line-height: 1.55;
      padding: 10px;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    li {
      position: relative;
      padding: 12px 40px 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.75);
      cursor: pointer;
      transition: border-color 0.2s;
      &:hover {
        border-color: var(--teal);
      }
      .t-title {
        font-weight: 700;
      }
      .t-meta {
        font-size: 12px;
        color: var(--text-dim);
        margin-top: 3px;
      }
      .del {
        position: absolute;
        top: 10px;
        right: 8px;
        border: none;
        background: none;
        color: var(--text-dim);
        cursor: pointer;
        &:hover {
          color: var(--danger);
        }
      }
    }
    .logout {
      border: none;
      background: none;
      color: var(--text-dim);
      font-size: 13px;
      cursor: pointer;
      text-decoration: underline;
      &:hover {
        color: var(--danger);
      }
    }
  `,
})
export class TripsListComponent {  readonly auth = inject(AuthService);
  private readonly tripsService = inject(TripsService);

  /** Список поездок пользователя (undefined = ещё грузится). */
  readonly trips = toSignal(this.watchTrips());

  /** Свежие сверху. */
  readonly sorted = computed<Trip[] | undefined>(() => {
    const list = this.trips();
    if (!list) {
      return undefined;
    }
    return [...list].sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? 0;
      const tb = b.updatedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
  });

  readonly openTrip = output<string>();
  readonly creating = signal(false);
  title = '';

  async create(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.creating()) {
      return;
    }
    this.creating.set(true);
    try {
      const currency = this.auth.profile()?.settings.currency ?? 'RUB';
      const id = await this.tripsService.createTrip(uid, this.title || 'Новое путешествие', currency);
      this.openTrip.emit(id);
    } finally {
      this.creating.set(false);
    }
  }

  async remove(trip: Trip, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!confirm('Удалить это путешествие? Нити расплетутся безвозвратно.')) {
      return;
    }
    await this.tripsService.remove(trip.id!);
  }

  private watchTrips(): Observable<Trip[]> {
    const uid = this.auth.user()?.uid;
    return uid ? this.tripsService.watchUserTrips(uid) : of([]);
  }
}
