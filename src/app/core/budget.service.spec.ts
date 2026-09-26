import { Trip, Waypoint, EMPTY_WAYPOINT_BUDGET } from './models';
import { categoryTotals, dailyTotals, waypointDays, tripRange } from './budget.service';

function wp(partial: Partial<Waypoint>): Waypoint {
  return { id: partial.id ?? Math.random().toString(36).slice(2), name: 'x', lat: 0, lng: 0, budget: { ...EMPTY_WAYPOINT_BUDGET }, ...partial };
}

function trip(partial: Partial<Trip>): Trip {
  return { ownerId: 'u1', title: 't', currency: 'RUB', waypoints: [], segments: [], ...partial };
}

describe('budget', () => {
  it('дни в точке: без дат — 0, только прибытие — 1, диапазон — включая день отъезда', () => {
    expect(waypointDays(wp({}))).toBe(0);
    expect(waypointDays(wp({ arrival: '2026-04-05' }))).toBe(1);
    expect(waypointDays(wp({ arrival: '2026-04-05', departure: '2026-04-12' }))).toBe(8);
  });

  it('итоги по категориям умножаются на дни, сегменты идут в транспорт', () => {
    const t = trip({
      waypoints: [
        wp({ arrival: '2026-04-01', departure: '2026-04-03', budget: { stay: 50, food: 20, transport: 5, activities: 10 } }),
        wp({ arrival: '2026-04-03', departure: '2026-04-04', budget: { stay: 100, food: 0, transport: 0, activities: 0 } }),
      ],
      segments: [{ id: 's1', type: 'flight', price: 300 }],
    });
    const totals = categoryTotals(t);
    expect(totals.stay).toBe(50 * 3 + 100 * 2);
    expect(totals.food).toBe(60);
    expect(totals.transport).toBe(5 * 3 + 300);
    expect(totals.activities).toBe(30);
    expect(totals.total).toBe(totals.stay + totals.food + totals.transport + totals.activities);
  });

  it('диапазон поездки выводится из точек, если даты не заданы', () => {
    const t = trip({
      waypoints: [
        wp({ arrival: '2026-04-05', departure: '2026-04-06' }),
        wp({ arrival: '2026-04-02' }),
      ],
    });
    expect(tripRange(t)[0]).toBe('2026-04-02');
    expect(tripRange(t).at(-1)).toBe('2026-04-06');
  });

  it('расходы по дням: стоимость точки делится на дни, сегмент падает на день прибытия', () => {
    const t = trip({
      startDate: '2026-04-01',
      endDate: '2026-04-02',
      waypoints: [
        wp({ arrival: '2026-04-01', departure: '2026-04-02', budget: { stay: 100, food: 0, transport: 0, activities: 0 } }),
        wp({ arrival: '2026-04-02' }),
      ],
      segments: [{ id: 's1', type: 'train', price: 50 }],
    });
    const days = dailyTotals(t);
    expect(days.length).toBe(2);
    expect(days[0]).toEqual({ date: '2026-04-01', amount: 100 });
    expect(days[1]).toEqual({ date: '2026-04-02', amount: 150 }); // 100 за день + 50 сегмент
  });
});
