import { EARTH_RADIUS_KM } from './geo-const';

export interface LatLng {
  lat: number;
  lng: number;
}

export type LatLngTuple = [number, number];

/** Расстояние по большому кругу, км. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Изогнутый путь между точками для нити на 2D-карте: квадратичная кривая
 * с отклонением контрольной точки перпендикулярно линии. Чем длиннее нить,
 * тем заметнее изгиб (с потолком), чтобы соседние дуги читались.
 */
export function curvedPath(from: LatLng, to: LatLng, bend = 0.18, samples = 40): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  // Перпендикуляр в градусах; для долготы учитываем сжатие к полюсам.
  const latScale = Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180) || 0.2;
  const midLat = from.lat + dLat / 2;
  const midLng = from.lng + dLng / 2;
  const distDeg = Math.hypot(dLat, dLng * latScale);
  const offset = Math.min(distDeg * bend, 12);
  const ctrlLat = midLat - (dLng * latScale) / (distDeg || 1) * offset;
  const ctrlLng = midLng + dLat / (distDeg || 1) * offset;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const lat = mt * mt * from.lat + 2 * mt * t * ctrlLat + t * t * to.lat;
    const lng = mt * mt * from.lng + 2 * mt * t * ctrlLng + t * t * to.lng;
    points.push([lat, lng]);
  }
  return points;
}
