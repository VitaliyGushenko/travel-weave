import { Injectable, computed, signal } from '@angular/core';
import { RouteSegment, Trip, Waypoint } from './models';
import { newSegment, newWaypoint } from './trips.service';

/**
 * Центральное состояние маршрута. Глобус, таймлайн, бюджет и карточки
 * читают одни и те же сигналы — изменение в любом месте перестраивает всё полотно.
 */
@Injectable({ providedIn: 'root' })
export class TripStore {
  readonly trip = signal<Trip | null>(null);
  /** Индекс выбранной точки (для карточки и fly-to). */
  readonly selectedIndex = signal<number | null>(null);
  /** Режим добавления точек кликом по глобусу. */
  readonly addMode = signal(false);
  /** Несохранённые изменения (для автосохранения). */
  readonly dirty = signal(false);

  readonly waypoints = computed(() => this.trip()?.waypoints ?? []);
  readonly segments = computed(() => this.trip()?.segments ?? []);
  readonly currency = computed(() => this.trip()?.currency ?? 'RUB');
  readonly isEmpty = computed(() => this.waypoints().length === 0);

  setTrip(trip: Trip | null, markClean = true): void {
    this.trip.set(trip);
    if (markClean) {
      this.dirty.set(false);
    }
    const sel = this.selectedIndex();
    if (trip && sel !== null && sel >= trip.waypoints.length) {
      this.selectedIndex.set(trip.waypoints.length ? trip.waypoints.length - 1 : null);
    }
  }

  markDirty(): void {
    this.dirty.set(true);
  }

  markClean(): void {
    this.dirty.set(false);
  }

  toggleAddMode(on?: boolean): void {
    this.addMode.set(on ?? !this.addMode());
  }

  select(index: number | null): void {
    this.selectedIndex.set(index);
  }

  /** Добавление точки: если в маршруте уже есть точки — между последней и новой появляется нить. */
  addPoint(lat: number, lng: number, name: string, country?: string): Waypoint {
    const trip = this.trip();
    if (!trip) {
      throw new Error('Поездка не выбрана');
    }
    const wp = newWaypoint(lat, lng, name, country);
    const waypoints = [...trip.waypoints, wp];
    const segments = [...trip.segments];
    if (waypoints.length > 1) {
      segments.push(newSegment('flight'));
    }
    this.commit(trip, waypoints, segments);
    return wp;
  }

  updateWaypoint(id: string, patch: Partial<Waypoint>): void {
    const trip = this.trip();
    if (!trip) {
      return;
    }
    this.commit(
      trip,
      trip.waypoints.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  }

  removeWaypoint(id: string): void {
    const trip = this.trip();
    if (!trip || !trip.waypoints.some((w) => w.id === id)) {
      return;
    }
    const waypoints = trip.waypoints.filter((w) => w.id !== id);
    // Сегменты отдаём как есть — reweave сам сопоставит нити парам точек.
    this.commit(trip, waypoints);
    const sel = this.selectedIndex();
    if (sel !== null && sel >= waypoints.length) {
      this.selectedIndex.set(waypoints.length ? waypoints.length - 1 : null);
    }
  }

  /** Drag-n-drop точки: массив переставляется, нити переплетаются заново. */
  moveWaypoint(from: number, to: number): void {
    const trip = this.trip();
    if (!trip || from === to || from < 0 || to < 0 || from >= trip.waypoints.length || to >= trip.waypoints.length) {
      return;
    }
    const waypoints = [...trip.waypoints];
    const [moved] = waypoints.splice(from, 1);
    waypoints.splice(to, 0, moved);
    this.commit(trip, waypoints);
  }

  updateSegment(index: number, patch: Partial<RouteSegment>): void {
    const trip = this.trip();
    if (!trip || !trip.segments[index]) {
      return;
    }
    const segments = trip.segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
    this.commit(trip, trip.waypoints, segments);
  }

  setMeta(patch: Partial<Pick<Trip, 'title' | 'startDate' | 'endDate' | 'currency'>>): void {
    const trip = this.trip();
    if (!trip) {
      return;
    }
    this.trip.set({ ...trip, ...patch });
    this.markDirty();
  }

  /**
   * Пересобирает сегменты под новый порядок точек: существующие нити
   * между парами точек сохраняются, новые получают тип по умолчанию.
   */
  private commit(
    trip: Trip,
    waypoints: Waypoint[],
    segmentsInput?: RouteSegment[],
  ): void {
    const segments = this.reweave(trip.waypoints, waypoints, segmentsInput ?? trip.segments);
    this.trip.set({ ...trip, waypoints, segments });
    this.markDirty();
  }

  private reweave(oldWps: Waypoint[], newWps: Waypoint[], oldSegments: RouteSegment[]): RouteSegment[] {
    const byPair = new Map<string, RouteSegment>();
    for (let i = 0; i < oldWps.length - 1; i++) {
      byPair.set(pairKey(oldWps[i], oldWps[i + 1]), oldSegments[i]);
    }
    const segments: RouteSegment[] = [];
    for (let i = 0; i < newWps.length - 1; i++) {
      const existing = byPair.get(pairKey(newWps[i], newWps[i + 1]));
      segments.push(existing ?? newSegment());
    }
    return segments;
  }
}

function pairKey(a: Waypoint, b: Waypoint): string {
  return `${a.id}->${b.id}`;
}
