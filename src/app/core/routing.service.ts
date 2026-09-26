import { Injectable, signal } from '@angular/core';

import { LatLngTuple } from './geo';
import { TransportType } from './models';

export interface RouteResult {
  path: LatLngTuple[];
  distanceKm: number;
  /** Часы в пути по оценке роутера. */
  durationH: number;
}

/** Профили OSRM, для которых есть дорожный роутинг. */
const OSRM_PROFILE: Partial<Record<TransportType, string>> = {
  car: 'driving',
  walk: 'foot',
};

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
}

/**
 * Дорожный роутинг между точками через публичный OSRM (демо-сервер, без ключа).
 * Результаты кэшируются по координатам пары: перетаскивание точки меняет ключ
 * и маршрут пересчитывается, перестановка точек местами — берётся из кэша.
 */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  /** Счётчик разрешённых маршрутов — для реактивности панели расстояний. */
  readonly version = signal(0);

  private readonly cache = new Map<string, RouteResult | null>();
  private readonly inflight = new Map<string, Promise<RouteResult | null>>();

  isRoutable(type: TransportType): boolean {
    return OSRM_PROFILE[type] !== undefined;
  }

  /** Ключ кэша: тип + координаты пары (4 знака ≈ 11 м — точности достаточно). */
  key(type: TransportType, from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
    const f = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}`;
    const t = `${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    return `${type}:${f}>${t}`;
  }

  /** Уже готовый результат из кэша (без запроса). */
  cached(key: string): RouteResult | null | undefined {
    return this.cache.get(key);
  }

  /** Путь по дорогам; null — роутинг недоступен или упал (нить рисуется дугой). */
  route(key: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }, type: TransportType): Promise<RouteResult | null> {
    const profile = OSRM_PROFILE[type];
    if (!profile) {
      return Promise.resolve(null);
    }
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }
    const promise = this.request(profile, from, to)
      .then((result) => {
        this.cache.set(key, result);
        this.version.update((v) => v + 1);
        return result;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async request(
    profile: string,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<RouteResult | null> {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as OsrmResponse;
      const route = data.routes?.[0];
      if (data.code !== 'Ok' || !route) {
        return null;
      }
      return {
        path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLngTuple),
        distanceKm: Math.round(route.distance / 100) / 10,
        durationH: Math.round(route.duration / 360) / 10,
      };
    } catch {
      return null;
    }
  }
}
