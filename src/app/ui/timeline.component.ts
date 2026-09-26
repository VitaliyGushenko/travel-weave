import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { BudgetService, dailyTotals, tripRange, waypointDays } from '../core/budget.service';
import { TripStore } from '../core/trip.store';

interface DayCol {
  date: string;
  label: string;
  cost: number;
  waypointIndex: number | null;
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="timeline">
      @if (days().length === 0) {
        <div class="hint">Задайте точкам даты прибытия — и время сплетётся в ленту</div>
      } @else {
        <div class="grid" [style.grid-template-columns]="'repeat(' + days().length + ', 64px)'">
          <!-- Блоки точек -->
          @for (b of blocks(); track b.index) {
            <div
              class="block"
              [style.grid-column]="(b.start + 1) + ' / ' + (b.end + 2)"
              [class.selected]="store.selectedIndex() === b.index"
              (click)="store.select(b.index)"
              [title]="b.name"
            >
              {{ b.name }}
            </div>
          }
          <!-- Колонки дней -->
          @for (d of days(); track d.date; let i = $index) {
            <div
              class="day"
              [class.filled]="d.cost > 0"
              (click)="d.waypointIndex !== null && store.select(d.waypointIndex)"
            >
              <span class="d-date">{{ d.label }}</span>
              <span class="d-cost" [style.opacity]="d.cost > 0 ? 1 : 0.25">
                {{ d.cost > 0 ? (d.cost | number: '1.0-0') : '·' }}
              </span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: /* less */ `
    :host {
      position: absolute;
      left: 352px;
      right: 352px;
      bottom: 14px;
      z-index: 10;
      pointer-events: none;
    }
    .timeline {
      pointer-events: auto;
      background: var(--bg-panel);
      border: 1px solid rgba(63, 216, 199, 0.18);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
      padding: 10px 12px;
      overflow-x: auto;
    }
    .hint {
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
      padding: 6px;
    }
    .grid {
      display: grid;
      grid-auto-rows: min-content;
      row-gap: 6px;
    }
    .block {
      grid-row: 1;
      background: linear-gradient(135deg, rgba(63, 216, 199, 0.28), rgba(63, 216, 199, 0.12));
      border: 1px solid rgba(63, 216, 199, 0.4);
      color: #c8f4ec;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      transition: border-color 0.2s;
      &:hover {
        border-color: var(--teal);
      }
      &.selected {
        border-color: var(--gold);
        color: #ffe9b0;
      }
    }
    .day {
      grid-row: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 5px 4px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      &:hover {
        border-color: rgba(63, 216, 199, 0.3);
      }
      .d-date {
        font-size: 10px;
        color: var(--text-dim);
        white-space: nowrap;
      }
      .d-cost {
        font-size: 11px;
        font-weight: 700;
        color: var(--gold);
        white-space: nowrap;
      }
      &.filled {
        background: rgba(242, 182, 76, 0.06);
      }
    }
  `,
})
export class TimelineComponent {
  readonly store = inject(TripStore);
  private readonly budget = inject(BudgetService);

  readonly days = computed<DayCol[]>(() => {
    const trip = this.store.trip();
    if (!trip) {
      return [];
    }
    const range = tripRange(trip);
    if (range.length === 0) {
      return [];
    }
    const perDay = dailyTotals(trip);
    const fmt = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });
    return range.map((date) => {
      const idx = trip.waypoints.findIndex((wp) => {
        if (!wp.arrival) {
          return false;
        }
        const dep = wp.departure ?? wp.arrival;
        return wp.arrival <= date && date <= dep;
      });
      const cost = perDay.find((d) => d.date === date)?.amount ?? 0;
      return {
        date,
        label: fmt.format(new Date(date + 'T00:00:00')),
        cost,
        waypointIndex: idx >= 0 ? idx : null,
      };
    });
  });

  readonly blocks = computed(() => {
    const trip = this.store.trip();
    const days = this.days();
    if (!trip || days.length === 0) {
      return [];
    }
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));
    const blocks: { index: number; start: number; end: number; name: string }[] = [];
    trip.waypoints.forEach((wp, index) => {
      if (!wp.arrival) {
        return;
      }
      const start = dayIndex.get(wp.arrival) ?? 0;
      const end = dayIndex.get(wp.departure ?? wp.arrival) ?? start;
      blocks.push({ index, start, end: Math.max(start, end), name: wp.name });
    });
    return blocks;
  });
}
