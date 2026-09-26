import { Component, effect, inject, signal } from '@angular/core';

import { AuthService } from './core/auth.service';
import { TripStore } from './core/trip.store';
import { TripsService } from './core/trips.service';
import { GlobeComponent } from './globe/globe.component';
import { AuthScreenComponent } from './ui/auth-screen.component';
import { BudgetPanelComponent } from './ui/budget-panel.component';
import { RoutePanelComponent } from './ui/route-panel.component';
import { TimelineComponent } from './ui/timeline.component';
import { TripsListComponent } from './ui/trips-list.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    GlobeComponent,
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
        <app-globe />
      } @placeholder {
        <div class="globe-placeholder"></div>
      }
      @defer (on immediate) {
        <app-route-panel />
        <app-budget-panel />
        <app-timeline />
      }
      @if (store.addMode()) {
        <div class="add-mode-banner">Кликните по глобусу, чтобы сплести новую точку маршрута</div>
      }
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
    .globe-placeholder {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 55%, rgba(63, 216, 199, 0.12), transparent 45%);
    }
    .add-mode-banner {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 20;
      padding: 8px 18px;
      border-radius: 999px;
      background: rgba(63, 216, 199, 0.16);
      border: 1px solid rgba(63, 216, 199, 0.45);
      color: #a9ede2;
      font-size: 13px;
      font-weight: 600;
      backdrop-filter: blur(8px);
      animation: banner-in 0.3s ease;
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
      right: 16px;
      z-index: 12;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(63, 216, 199, 0.3);
      background: var(--bg-panel);
      color: #a9ede2;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      backdrop-filter: blur(8px);
      &:hover {
        border-color: var(--teal);
      }
    }
    @keyframes banner-in {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
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
