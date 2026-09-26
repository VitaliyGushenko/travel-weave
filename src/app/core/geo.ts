import { Vector3 } from 'three';

export const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Перевод географических координат в позицию на сфере Three.js.
 * Соответствует стандартной развёртке текстуры на SphereGeometry.
 */
export function latLngToVec3(lat: number, lng: number, radius = 1): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Обратное преобразование точки на сфере в широту/долготу. */
export function vec3ToLatLng(v: Vector3): LatLng {
  const r = v.length();
  const lat = 90 - (Math.acos(v.y / r) * 180) / Math.PI;
  let lng = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180;
  if (lng < -180) {
    lng += 360;
  }
  if (lng > 180) {
    lng -= 360;
  }
  return { lat, lng };
}

/**
 * Дуга большого круга между двумя точками, поднятая над поверхностью.
 * Высота растёт по параболе и достигает максимума в середине дуги.
 */
export function greatCirclePoints(
  from: LatLng,
  to: LatLng,
  segments = 64,
  altitude = 0.22,
): Vector3[] {
  const start = latLngToVec3(from.lat, from.lng, 1);
  const end = latLngToVec3(to.lat, to.lng, 1);
  const angle = start.angleTo(end);
  const points: Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let v: Vector3;
    if (angle < 0.001) {
      v = start.clone().lerp(end, t);
    } else {
      const sinA = Math.sin((1 - t) * angle) / Math.sin(angle);
      const sinB = Math.sin(t * angle) / Math.sin(angle);
      v = start.clone().multiplyScalar(sinA).add(end.clone().multiplyScalar(sinB));
    }
    const h = 1 + altitude * Math.sin(Math.PI * t);
    points.push(v.normalize().multiplyScalar(h));
  }
  return points;
}

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
