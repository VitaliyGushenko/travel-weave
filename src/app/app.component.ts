import { Component, effect, inject, signal } from '@angular/core';

import { AuthService } from './core/auth.service';
import { TripStore } from './core/trip.store';
import { TripsService } from './core/trips.service';
import { MapComponent } from './map/map.component';
import { AuthScreenComponent } from './ui/auth-screen.component';
import { BudgetPanelComponent } from './ui/budget-panel.component';
import { RoutePanelComponent } from './ui/route-panel.component';
import { TimelineComponent } from './ui/timeline.component';
import { TripsListComponent } from './ui/trips-list.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MapComponent,
    RoutePanelComponent,
    TimelineComponent,
    BudgetPanelComponent,
    AuthScreenComponent,
    TripsListComponent,
  ],
  template: `
    @if (!auth.isReady()) {
      <div class="boot">
        <div class="boot-title">Travel Weave</div>
        <div class="boot-sub">разматываем нити…</div>
      </div>
    } @else if (!auth.isAuthenticated()) {
      <app-auth-screen />
    } @else if (tripId() === null) {
      <app-trips-list (openTrip)="openTrip($event)" />
    } @else {
      @defer (on immediate) {
        <app-map />
      } @placeholder {
        <div class="map-placeholder"></div>
      }
      @defer (on immediate) {
        <app-route-panel />
        <app-budget-panel />
        <app-timeline />
      }
      <div class="map-hint">Клик по карте — новая точка маршрута</div>
      @if (store.dirty()) {
        <div class="save-dot" title="Есть несохранённые изменения">●</div>
      }
      <button type="button" class="back-btn" (click)="closeTrip()" title="К списку поездок">
        ‹ Поездки
      </button>
    }
  `,
  styles: /* less */ `
    .boot {
      height: 100vh;
      display: grid;
      place-content: center;
      gap: 8px;
      text-align: center;
      .boot-title {
        font-family: var(--font-display);
        font-size: 26px;
        color: var(--gold);
        letter-spacing: 0.1em;
      }
      .boot-sub {
        color: var(--text-dim);
        font-size: 13px;
      }
    }
    .map-placeholder {
      position: absolute;
      inset: 0;
      background: var(--bg);
    }
    .map-hint {
      position: absolute;
      bottom: 14px;
      left: 352px;
      z-index: 9;
      padding: 7px 16px;
      border-radius: 999px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 12.5px;
      font-weight: 600;
      box-shadow: 0 2px 12px rgba(20, 50, 80, 0.1);
      pointer-events: none;
    }
    .save-dot {
      position: absolute;
      top: 22px;
      right: 300px;
      z-index: 15;
      color: var(--gold);
      font-size: 14px;
      animation: pulse 1.2s ease infinite;
    }
    .back-btn {
      position: absolute;
      bottom: 16px;
      right: 60px;
      z-index: 12;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--bg-panel);
      color: var(--teal);
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(20, 50, 80, 0.12);
      &:hover {
        border-color: var(--teal);
      }
    }
    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }
  `,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(TripStore);
  private readonly tripsService = inject(TripsService);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** id открытой поездки (null — показываем список). */
  readonly tripId = signal<string | null>(null);

  constructor() {
    // Автосохранение: любое изменение маршрута через паузу уходит в Firestore.
    effect(() => {
      const dirty = this.store.dirty();
      const trip = this.store.trip();
      if (!dirty || !trip?.id) {
        return;
      }
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
      this.saveTimer = setTimeout(() => {
        const t = this.store.trip();
        if (t?.id) {
          void this.tripsService.save(t.id, t).then(() => this.store.markClean());
        }
      }, 900);
    });
  }

  async openTrip(id: string): Promise<void> {
    const trip = await this.tripsService.getTripOnce(id);
    if (trip) {
      this.store.setTrip(trip);
      this.tripId.set(id);
    }
  }

  closeTrip(): void {
    this.store.setTrip(null);
    this.store.select(null);
    this.tripId.set(null);
  }
}
