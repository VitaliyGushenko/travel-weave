import * as L from 'leaflet';

import { curvedPath } from '../core/geo';
import { TransportType, Waypoint } from '../core/models';

export interface MapSceneHandlers {
  onClick: (lat: number, lng: number) => void;
  onSelect: (index: number) => void;
  onMove: (id: string, lat: number, lng: number) => void;
}

interface ThreadStyle {
  color: string;
  weight: number;
  dash?: string;
  curve: number;
  flow?: boolean;
}

const THREAD_STYLES: Record<TransportType, ThreadStyle> = {
  flight: { color: '#e0912f', weight: 4, curve: 0.22, flow: true },
  train: { color: '#0e9488', weight: 4, dash: '12 9', curve: 0.12 },
  car: { color: '#7c5cd6', weight: 4, curve: 0.1 },
  cruise: { color: '#3b82f6', weight: 4, dash: '3 9', curve: 0.08 },
  walk: { color: '#64748b', weight: 3, dash: '2 7', curve: 0.06 },
};

/** Карта с нитями маршрута: Leaflet + OpenStreetMap, зум до домов (z19). */
export class MapScene {
  readonly map: L.Map;
  private readonly markersLayer = L.layerGroup();
  private readonly threadsLayer = L.layerGroup();
  private readonly markers = new Map<string, L.Marker>();

  constructor(
    container: HTMLElement,
    private readonly handlers: MapSceneHandlers,
  ) {
    this.map = L.map(container, {
      center: [35, 90],
      zoom: 4,
      zoomControl: false,
      worldCopyJump: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.threadsLayer.addTo(this.map);

    // Клик по карте — новая точка маршрута (маркеры клик не пропускают).
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.handlers.onClick(e.latlng.lat, e.latlng.lng);
    });
  }

  /** Перестраивает маркеры и нити под текущий маршрут. */
  render(waypoints: Waypoint[], segments: { type: TransportType }[], selectedIndex: number | null): void {
    this.renderMarkers(waypoints, selectedIndex);
    this.renderThreads(waypoints, segments);
  }

  private renderMarkers(waypoints: Waypoint[], selectedIndex: number | null): void {
    const seen = new Set<string>();
    for (let index = 0; index < waypoints.length; index++) {
      const wp = waypoints[index];
      seen.add(wp.id);
      const selected = index === selectedIndex;
      const existing = this.markers.get(wp.id);
      if (existing) {
        existing.setLatLng([wp.lat, wp.lng]);
        existing.setIcon(this.icon(index, selected));
        continue;
      }
      const marker = L.marker([wp.lat, wp.lng], {
        icon: this.icon(index, selected),
        draggable: true,
        autoPan: true,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e as unknown as Event);
        this.handlers.onSelect(index);
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        this.handlers.onMove(wp.id, ll.lat, ll.lng);
      });
      marker.addTo(this.markersLayer);
      this.markers.set(wp.id, marker);
    }

    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        this.markersLayer.removeLayer(marker);
        this.markers.delete(id);
      }
    }
  }

  private renderThreads(waypoints: Waypoint[], segments: { type: TransportType }[]): void {
    this.threadsLayer.clearLayers();
    for (let i = 0; i < waypoints.length - 1; i++) {
      const style = THREAD_STYLES[segments[i]?.type ?? 'flight'];
      const path = curvedPath(waypoints[i], waypoints[i + 1], style.curve);
      L.polyline(path, {
        color: style.color,
        weight: style.weight,
        opacity: 0.85,
        dashArray: style.dash,
        lineCap: 'round',
        lineJoin: 'round',
        className: style.flow ? 'thread-flow' : undefined,
      }).addTo(this.threadsLayer);
    }
  }

  private icon(index: number, selected: boolean): L.DivIcon {
    return L.divIcon({
      className: 'wp-marker-wrap',
      html: `<div class="wp-marker${selected ? ' selected' : ''}">${index + 1}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  flyTo(lat: number, lng: number, zoom?: number): void {
    this.map.flyTo([lat, lng], zoom ?? Math.max(this.map.getZoom(), 8), { duration: 0.9 });
  }

  fitRoute(waypoints: Waypoint[]): void {
    if (waypoints.length === 0) {
      return;
    }
    const bounds = L.latLngBounds(waypoints.map((w) => [w.lat, w.lng] as L.LatLngTuple));
    // Учитываем левую панель и нижний таймлайн, чтобы маршрут не прятался под UI.
    this.map.fitBounds(bounds, {
      paddingTopLeft: [370, 60],
      paddingBottomRight: [70, 170],
      maxZoom: 10,
    });
  }

  destroy(): void {
    this.map.remove();
  }
}
