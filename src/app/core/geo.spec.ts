import { latLngToVec3, vec3ToLatLng, greatCirclePoints, distanceKm } from './geo';

describe('geo', () => {
  it('переводит координаты туда и обратно без потерь', () => {
    const cases = [
      { lat: 55.75, lng: 37.62 }, // Москва
      { lat: 35.68, lng: 139.69 }, // Токио
      { lat: -33.87, lng: 151.21 }, // Сидней
      { lat: 0, lng: 0 },
      { lat: 89, lng: -170 },
    ];
    for (const c of cases) {
      const back = vec3ToLatLng(latLngToVec3(c.lat, c.lng));
      expect(back.lat).toBeCloseTo(c.lat, 4);
      expect(back.lng).toBeCloseTo(c.lng, 4);
    }
  });

  it('дуга большого круга начинается и заканчивается в точках маршрута', () => {
    const from = { lat: 55.75, lng: 37.62 };
    const to = { lat: 35.68, lng: 139.69 };
    const pts = greatCirclePoints(from, to, 48, 0.2);
    expect(pts.length).toBe(49);
    expect(pts[0].length()).toBeCloseTo(1, 5);
    expect(pts[24].length()).toBeCloseTo(1.2, 5); // середина приподнята
    expect(pts[pts.length - 1].length()).toBeCloseTo(1, 5);
  });

  it('максимум высоты дуги — в середине', () => {
    const pts = greatCirclePoints({ lat: 10, lng: 10 }, { lat: 40, lng: 60 }, 100, 0.3);
    const radii = pts.map((p) => p.length());
    const maxIdx = radii.indexOf(Math.max(...radii));
    expect(maxIdx).toBe(50);
  });

  it('считает расстояние Москва → Токио порядка 7500 км', () => {
    const d = distanceKm({ lat: 55.75, lng: 37.62 }, { lat: 35.68, lng: 139.69 });
    expect(d).toBeGreaterThan(7000);
    expect(d).toBeLessThan(8000);
  });

  it('нулевое расстояние для одной точки', () => {
    expect(distanceKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });
});
