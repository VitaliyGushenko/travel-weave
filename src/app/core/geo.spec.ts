import { curvedPath, distanceKm } from './geo';

describe('geo', () => {
  it('считает расстояние Москва → Токио порядка 7500 км', () => {
    const d = distanceKm({ lat: 55.75, lng: 37.62 }, { lat: 35.68, lng: 139.69 });
    expect(d).toBeGreaterThan(7000);
    expect(d).toBeLessThan(8000);
  });

  it('нулевое расстояние для одной точки', () => {
    expect(distanceKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });

  it('изогнутый путь начинается и заканчивается в точках маршрута', () => {
    const pts = curvedPath({ lat: 55.75, lng: 37.62 }, { lat: 59.94, lng: 30.31 }, 0.2, 24);
    expect(pts.length).toBe(25);
    expect(pts[0][0]).toBeCloseTo(55.75, 4);
    expect(pts[0][1]).toBeCloseTo(37.62, 4);
    expect(pts[24][0]).toBeCloseTo(59.94, 4);
    expect(pts[24][1]).toBeCloseTo(30.31, 4);
  });

  it('путь отклоняется от прямой линии', () => {
    const pts = curvedPath({ lat: 50, lng: 30 }, { lat: 60, lng: 40 }, 0.3, 40);
    // максимум расстояния от середины прямой должен быть заметно больше нуля
    const mid = pts[20];
    const lineMidLat = 55;
    const lineMidLng = 35;
    const dev = Math.hypot(mid[0] - lineMidLat, mid[1] - lineMidLng);
    expect(dev).toBeGreaterThan(0.5);
  });

  it('для совпадающих точек путь вырождается в точку без NaN', () => {
    const pts = curvedPath({ lat: 10, lng: 20 }, { lat: 10, lng: 20 }, 0.2, 8);
    expect(pts.length).toBe(9);
    for (const p of pts) {
      expect(Number.isFinite(p[0])).toBeTrue();
      expect(Number.isFinite(p[1])).toBeTrue();
    }
  });
});
