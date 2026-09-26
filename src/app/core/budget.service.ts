import { Injectable } from '@angular/core';
import { RouteSegment, Trip, Waypoint } from './models';

export interface BudgetCategoryTotals {
  stay: number;
  food: number;
  transport: number;
  activities: number;
  total: number;
}

export interface BudgetDay {
  date: string;
  amount: number;
}

const DAY_MS = 86_400_000;

export function diffDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z').getTime();
  const to = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((to - from) / DAY_MS);
}

/** Дней в точке, включая день отъезда (0 — если даже прибытие не задано). */
export function waypointDays(wp: Waypoint): number {
  if (!wp.arrival) {
    return 0;
  }
  if (!wp.departure) {
    return 1;
  }
  return Math.max(1, diffDays(wp.arrival, wp.departure) + 1);
}

export function dateRange(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const total = Math.max(0, diffDays(startIso, endIso));
  for (let i = 0; i <= total; i++) {
    days.push(new Date(new Date(startIso + 'T00:00:00Z').getTime() + i * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

/** Итоги по категориям: жильё/еда/активности — из точек, транспорт — из сегментов и локального транспорта. */
export function categoryTotals(trip: Trip): BudgetCategoryTotals {
  let stay = 0;
  let food = 0;
  let transport = 0;
  let activities = 0;

  for (const wp of trip.waypoints) {
    const days = waypointDays(wp);
    stay += wp.budget.stay * days;
    food += wp.budget.food * days;
    transport += wp.budget.transport * days;
    activities += wp.budget.activities * days;
  }

  for (const seg of trip.segments) {
    transport += seg.price ?? 0;
  }

  return { stay, food, transport, activities, total: stay + food + transport + activities };
}

/**
 * Расходы по дням поездки. Стоимость точки делится на дни пребывания;
 * цена сегмента падает на день прибытия в следующую точку.
 */
export function dailyTotals(trip: Trip): BudgetDay[] {
  const days = tripRange(trip);
  if (days.length === 0) {
    return [];
  }
  const map = new Map<string, number>(days.map((d) => [d, 0]));

  const add = (date: string, amount: number) => {
    if (map.has(date)) {
      map.set(date, (map.get(date) ?? 0) + amount);
    }
  };

  for (const wp of trip.waypoints) {
    if (!wp.arrival) {
      continue;
    }
    // Поля бюджета — дневные ставки, делим их на дни не нужно.
    const perDay =
      wp.budget.stay + wp.budget.food + wp.budget.transport + wp.budget.activities;
    for (const date of dateRange(wp.arrival, wp.departure ?? wp.arrival)) {
      add(date, perDay);
    }
  }

  for (let i = 0; i < trip.segments.length; i++) {
    const seg = trip.segments[i];
    const next = trip.waypoints[i + 1];
    const date = next?.arrival ?? next?.departure ?? days[0];
    add(date, seg.price ?? 0);
  }

  return days.map((date) => ({ date, amount: Math.round(map.get(date) ?? 0) }));
}

/** Диапазон поездки: явные даты либо минимальные/максимальные даты точек. */
export function tripRange(trip: Trip): string[] {
  const start = trip.startDate ?? trip.waypoints.map((w) => w.arrival).filter(Boolean).sort()[0];
  const end =
    trip.endDate ?? trip.waypoints.map((w) => w.departure ?? w.arrival).filter(Boolean).sort().pop();
  if (!start || !end) {
    return [];
  }
  return dateRange(start, end);
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  totals(trip: Trip): BudgetCategoryTotals {
    return categoryTotals(trip);
  }

  daily(trip: Trip): BudgetDay[] {
    return dailyTotals(trip);
  }

  tripDays(trip: Trip): number {
    return tripRange(trip).length;
  }

  formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
