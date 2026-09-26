import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { Trip, Waypoint, RouteSegment, EMPTY_WAYPOINT_BUDGET } from './models';

@Injectable({ providedIn: 'root' })
export class TripsService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  /** Поездки пользователя (без сортировки в запросе — сортируем на клиенте). */
  watchUserTrips(uid: string): Observable<Trip[]> {
    return runInInjectionContext(
      this.injector,
      () =>
        collectionData(
          query(collection(this.firestore, 'trips'), where('ownerId', '==', uid)),
          { idField: 'id' },
        ) as Observable<Trip[]>,
    );
  }

  watchTrip(id: string): Observable<Trip | null> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, 'trips', id), { idField: 'id' }),
    ) as Observable<Trip | null>;
  }

  /** Разовая загрузка без живой подписки — чтобы автосохранение не конфликтовало с редактированием. */
  async getTripOnce(id: string): Promise<Trip | null> {
    return runInInjectionContext(this.injector, async () => {
      const snap = await getDoc(doc(this.firestore, 'trips', id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Trip) : null;
    });
  }

  async createTrip(uid: string, title: string, currency = 'BYN'): Promise<string> {
    const ref = await addDoc(collection(this.firestore, 'trips'), {
      ownerId: uid,
      title: title.trim() || 'Новое путешествие',
      currency,
      waypoints: [],
      segments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  /** Полное сохранение маршрута (точки и сегменты — вложенные массивы). */
  async save(tripId: string, trip: Trip): Promise<void> {
    const { id, ...data } = trip;
    await setDoc(
      doc(this.firestore, 'trips', tripId),
      { ...data, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  async remove(tripId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'trips', tripId));
  }
}

/** Фабрика пустых объектов маршрута — единые дефолты для UI и store. */
export function newWaypoint(lat: number, lng: number, name: string, country?: string): Waypoint {
  return {
    id: crypto.randomUUID(),
    name,
    country,
    lat,
    lng,
    budget: { ...EMPTY_WAYPOINT_BUDGET },
  };
}

export function newSegment(type: RouteSegment['type'] = 'flight'): RouteSegment {
  return {
    id: crypto.randomUUID(),
    type,
    price: 0,
    durationHours: undefined,
  };
}
