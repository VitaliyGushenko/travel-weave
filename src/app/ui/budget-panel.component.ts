import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BudgetService, categoryTotals } from '../core/budget.service';
import { TripStore } from '../core/trip.store';

const CURRENCIES = ['BYN', 'RUB', 'USD'];

@Component({
  selector: 'app-budget-panel',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <div class="panel">
      <h3>Бюджет</h3>

      @if (!trip()) {
        <div class="empty">Поездка не выбрана</div>
      } @else if (totals().total === 0) {
        <div class="empty">
          Заполни расходы в точках — и здесь сплетётся прогноз всей поездки
        </div>
      } @else {
        <div class="total">
          {{ budget.formatMoney(totals().total, trip()!.currency) }}
          <span class="per-day">≈ {{ budget.formatMoney(perDay(), trip()!.currency) }} в день</span>
        </div>

        <div class="bars">
          @for (row of rows(); track row.label) {
            <div class="row" [title]="row.label">
              <span class="dot" [style.background]="row.color"></span>
              <span class="label">{{ row.label }}</span>
              <span class="value">{{ row.value | number: '1.0-0' }}</span>
              <div class="bar">
                <div class="fill" [style.width.%]="row.percent" [style.background]="row.color"></div>
              </div>
            </div>
          }
        </div>

        <svg class="spark" viewBox="0 0 220 48" preserveAspectRatio="none">
          <polyline [attr.points]="sparkPoints()" fill="none" stroke="#d9902a" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="spark-hint">расходы по дням</div>
      }

      <label class="currency">
        Валюта
        <select
          [ngModel]="trip()?.currency ?? 'RUB'"
          (ngModelChange)="store.setMeta({ currency: $event })"
        >
          @for (c of currencies; track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
      </label>
    </div>
  `,
  styles: /* less */ `
    :host {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 260px;
      z-index: 10;
    }
    .panel {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 6px 28px rgba(20, 50, 80, 0.12);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h3 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .empty {
      color: var(--text-dim);
      font-size: 13px;
      line-height: 1.5;
    }
    .total {
      font-family: var(--font-display);
      font-size: 22px;
      color: var(--gold);
      display: flex;
      flex-direction: column;
      gap: 2px;
      .per-day {
        font-family: var(--font-body);
        font-size: 11px;
        color: var(--text-dim);
      }
    }
    .bars {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .row {
      display: grid;
      grid-template-columns: 10px 1fr auto;
      grid-template-rows: auto 4px;
      column-gap: 8px;
      row-gap: 3px;
      align-items: center;
      font-size: 12px;
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .label {
        color: var(--text);
      }
      .value {
        color: var(--text-dim);
        font-weight: 600;
      }
      .bar {
        grid-column: 1 / -1;
        background: rgba(22, 60, 90, 0.08);
        border-radius: 2px;
        height: 4px;
        overflow: hidden;
        .fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s ease;
        }
      }
    }
    .spark {
      width: 100%;
      height: 48px;
    }
    .spark-hint {
      font-size: 10px;
      color: var(--text-dim);
      text-align: right;
      margin-top: -8px;
    }
    .currency {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--text-dim);
    }
  `,
})
export class BudgetPanelComponent {
  readonly store = inject(TripStore);
  readonly budget = inject(BudgetService);
  readonly currencies = CURRENCIES;

  readonly trip = computed(() => this.store.trip());
  readonly totals = computed(() => {
    const trip = this.trip();
    return trip ? categoryTotals(trip) : { stay: 0, food: 0, transport: 0, activities: 0, total: 0 };
  });
  readonly perDay = computed(() => {
    const trip = this.trip();
    if (!trip) {
      return 0;
    }
    const days = this.budget.tripDays(trip);
    return days > 0 ? this.totals().total / days : 0;
  });

  private readonly categoryColors: Record<string, string> = {
    stay: '#3fd8c7',
    food: '#f2b64c',
    transport: '#6ea8ff',
    activities: '#9b7bff',
  };
  private readonly categoryLabels: Record<string, string> = {
    stay: 'Жильё',
    food: 'Еда',
    transport: 'Транспорт',
    activities: 'Активности',
  };

  readonly rows = computed(() => {
    const t = this.totals();
    return (['stay', 'food', 'transport', 'activities'] as const)
      .map((k) => ({
        label: this.categoryLabels[k],
        value: t[k],
        color: this.categoryColors[k],
        percent: t.total > 0 ? (t[k] / t.total) * 100 : 0,
      }))
      .filter((r) => r.value > 0);
  });

  readonly sparkPoints = computed(() => {
    const trip = this.trip();
    if (!trip) {
      return '';
    }
    const days = this.budget.daily(trip);
    if (days.length < 2) {
      return '';
    }
    const max = Math.max(...days.map((d) => d.amount), 1);
    return days
      .map((d, i) => {
        const x = (i / (days.length - 1)) * 220;
        const y = 44 - (d.amount / max) * 40;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
}
