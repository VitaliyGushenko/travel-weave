import { Component, inject } from '@angular/core';

import { GlobeComponent } from './globe/globe.component';
import { TripStore } from './core/trip.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GlobeComponent],
  template: `
    @defer (on immediate) {
      <app-globe />
    } @placeholder {
      <div class="globe-placeholder"></div>
    }
    <div class="test-panel">
      <button type="button" (click)="store.toggleAddMode()">
        {{ store.addMode() ? 'Кликай по глобусу… (готово)' : 'Добавить точку' }}
      </button>
      <div class="waypoints">
        @for (wp of store.waypoints(); track wp.id) {
          <span class="chip">{{ wp.name }}</span>
        }
      </div>
    </div>
  `,
  styles: /* less */ `
    .globe-placeholder {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 55%, rgba(63, 216, 199, 0.12), transparent 45%);
    }
    .test-panel {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(8, 16, 36, 0.72);
      border: 1px solid rgba(63, 216, 199, 0.2);
      backdrop-filter: blur(8px);
      button {
        padding: 10px 16px;
        border-radius: 10px;
        border: 1px solid rgba(242, 182, 76, 0.5);
        background: rgba(242, 182, 76, 0.12);
        color: #f2d9a0;
        font: inherit;
        cursor: pointer;
      }
      .waypoints {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        max-width: 260px;
      }
      .chip {
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(63, 216, 199, 0.14);
        border: 1px solid rgba(63, 216, 199, 0.3);
        color: #a9ede2;
        font-size: 12px;
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
