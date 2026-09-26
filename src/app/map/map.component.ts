import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import { reverseGeocode } from '../core/geocode';
import { RoutingService } from '../core/routing.service';
import { TripStore } from '../core/trip.store';
import { MapScene } from './map-scene';

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div class="map-host" #host></div>`,
  styles: /* less */ `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      z-index: 1;
    }
    .map-host {
      position: absolute;
      inset: 0;
      background: #e8eef5;
    }
  `,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly store = inject(TripStore);
  private readonly routing = inject(RoutingService);
  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');

  private scene?: MapScene;
  private fittedTripId: string | null = null;
  /** Индекс, выбранный кликом по маркеру (чтобы камера не прыгала под курсором). */
  private markerClickIndex: number | null = null;

  constructor() {
    // Маршрут изменился — перерисовываем маркеры и нити.
    effect(() => {
      const wps = this.store.waypoints();
      const segs = this.store.segments();
      const sel = this.store.selectedIndex();
      this.scene?.render(wps, segs, sel);
    });

    // Выбор точки из списка/таймлайна — подлетаем (клик по маркеру сам под курсором).
    effect(() => {
      const index = this.store.selectedIndex();
      const wps = this.store.waypoints();
      if (index === null || !this.scene || !wps[index]) {
        return;
      }
      if (this.markerClickIndex === index) {
        this.markerClickIndex = null;
        return;
      }
      this.scene.flyTo(wps[index].lat, wps[index].lng);
    });

    // Открыли поездку — подгоняем масштаб под весь маршрут.
    effect(() => {
      const trip = this.store.trip();
      const wps = this.store.waypoints();
      if (!this.scene || !trip || trip.id === this.fittedTripId) {
        return;
      }
      this.fittedTripId = trip.id ?? null;
      if (wps.length > 1) {
        // Даём эффекту выше перерисовать маркеры, затем подгоняем кадр.
        setTimeout(() => this.scene?.fitRoute(this.store.waypoints()), 60);
      }
    });
  }

  ngAfterViewInit(): void {
    const host = this.hostRef().nativeElement;
    // Эффекты могли отработать до создания сцены — возвращаем её и рисуем текущий маршрут сами.
    const scene = this.zone.runOutsideAngular(
      () =>
        new MapScene(
          host,
          {
            onClick: (lat, lng) => this.zone.run(() => void this.addPointAt(lat, lng)),
            onSelect: (index) =>
              this.zone.run(() => {
                this.markerClickIndex = index;
                this.store.select(index);
              }),
            onMove: (id, lat, lng) =>
              this.zone.run(() => this.store.updateWaypoint(id, { lat, lng })),
          },
          this.routing,
        ),
    );
    this.scene = scene;

    const wps = this.store.waypoints();
    scene.render(wps, this.store.segments(), this.store.selectedIndex());
    const trip = this.store.trip();

    // Если сцена создалась при нулевом/промежуточном размере контейнера —
    // пересчитываем сетку плиток, когда контейнер гарантированно устоялся.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scene.invalidateSize();
        if (trip?.id && wps.length > 1) {
          this.fittedTripId = trip.id;
          scene.fitRoute(this.store.waypoints());
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.scene?.destroy();
  }

  /** Клик по карте сразу сплетает новую точку маршрута. */
  private async addPointAt(lat: number, lng: number): Promise<void> {
    const name = await reverseGeocode(lat, lng);
    this.store.addPoint(lat, lng, name);
  }
}
