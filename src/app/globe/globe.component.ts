import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { TripStore } from '../core/trip.store';
import { GlobeScene } from './globe-scene';

@Component({
  selector: 'app-globe',
  standalone: true,
  template: `
    <div class="globe-host" #host></div>
    @if (hover(); as h) {
      <div class="globe-tooltip" [style.left.px]="h.x + 14" [style.top.px]="h.y - 10">
        {{ nameAt(h.index) }}
      </div>
    }
  `,
  styles: /* less */ `
    :host {
      position: absolute;
      inset: 0;
      display: block;
    }
    .globe-host {
      position: absolute;
      inset: 0;
      cursor: grab;
    }
    .globe-host:active {
      cursor: grabbing;
    }
    .globe-tooltip {
      position: absolute;
      z-index: 5;
      pointer-events: none;
      padding: 6px 12px;
      border-radius: 10px;
      background: rgba(10, 20, 40, 0.85);
      border: 1px solid rgba(63, 216, 199, 0.35);
      color: #d7f5ef;
      font-size: 13px;
      letter-spacing: 0.02em;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      white-space: nowrap;
    }
  `,
})
export class GlobeComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  readonly store = inject(TripStore);
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');

  private engine?: GlobeScene;
  /** Индекс, выбранный кликом по глобусу (чтобы не устраивать подлёт к месту под курсором). */
  private globeClickIndex: number | null = null;

  readonly hover = signal<{ index: number; x: number; y: number } | null>(null);

  constructor() {
    // Маршрут изменился — перестраиваем маркеры и нити.
    effect(() => {
      const wps = this.store.waypoints();
      const segs = this.store.segments();
      this.engine?.setWaypoints(wps);
      this.engine?.setThreads(wps, segs);
    });

    // Режим добавления точек.
    effect(() => {
      this.engine?.setAddMode(this.store.addMode());
    });

    // Выбор точки: подлетаем, только если выбор пришёл не с глобуса.
    effect(() => {
      const index = this.store.selectedIndex();
      if (index === null) {
        this.engine?.setSelected(null);
        return;
      }
      const fromGlobe = this.globeClickIndex === index;
      this.engine?.setSelected(index, !fromGlobe);
      if (fromGlobe) {
        this.globeClickIndex = null;
      }
    });
  }

  ngAfterViewInit(): void {
    const host = this.hostRef().nativeElement;
    this.zone.runOutsideAngular(() => {
      this.engine = new GlobeScene(host, {
        onWaypointClick: (index) =>
          this.zone.run(() => {
            this.globeClickIndex = index;
            this.store.select(index);
          }),
        onGlobeClick: (lat, lng) =>
          this.zone.run(() => {
            void this.addPointAt(lat, lng);
          }),
        onHover: (h) => this.zone.run(() => this.hover.set(h)),
      });
    });
    // Синхронизируем текущее состояние движка (эффекты могли отработать до его создания).
    this.engine?.setAddMode(this.store.addMode());
    (window as unknown as { __globeEngine?: GlobeScene }).__globeEngine = this.engine;
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }

  /** Клик по глобусу: добавляем точку, имя берём обратным геокодингом. */
  private async addPointAt(lat: number, lng: number): Promise<void> {
    this.engine?.flashAt(lat, lng);
    const name = await reverseGeocode(lat, lng);
    this.store.addPoint(lat, lng, name);
  }

  nameAt(index: number): string {
    return this.store.waypoints()[index]?.name ?? '';
  }
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `Точка ${lat.toFixed(1)}, ${lng.toFixed(1)}`;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ru`,
    );
    if (!res.ok) {
      return fallback;
    }
    const data = (await res.json()) as BigDataCloudResponse;
    const place = data.city || data.locality || data.principalSubdivision;
    return place ? place : fallback;
  } catch {
    return fallback;
  }
}
