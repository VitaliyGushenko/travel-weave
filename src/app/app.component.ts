import { Component, inject } from '@angular/core';

import { GlobeComponent } from './globe/globe.component';
import { RoutePanelComponent } from './ui/route-panel.component';
import { TimelineComponent } from './ui/timeline.component';
import { BudgetPanelComponent } from './ui/budget-panel.component';
import { TripStore } from './core/trip.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GlobeComponent, RoutePanelComponent, TimelineComponent, BudgetPanelComponent],
  template: `
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
  `,
  styles: /* less */ `
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
  `,
})
export class AppComponent {
  readonly store = inject(TripStore);

  constructor() {
    // Временная демо-поездка для разработки (до подключения auth/списка поездок).
    this.store.setTrip({
      ownerId: 'demo',
      title: 'Демо-маршрут',
      currency: 'RUB',
      waypoints: [],
      segments: [],
    });
  }
}
