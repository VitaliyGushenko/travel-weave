import { Timestamp } from '@angular/fire/firestore';

/** Ссылка на файл в Supabase Storage — хранится внутри документов Firestore. */
export interface StoredFile {
  url: string;
  path: string;
  createdAt?: Timestamp | null;
}

export type TransportType = 'flight' | 'train' | 'car' | 'cruise' | 'walk';

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  flight: 'Перелёт',
  train: 'Поезд',
  car: 'Авто',
  cruise: 'Круиз',
  walk: 'Пешком',
};

/** Бюджет на один день пребывания в точке, по категориям. */
export interface WaypointBudget {
  stay: number;
  food: number;
  transport: number;
  activities: number;
}

export const EMPTY_WAYPOINT_BUDGET: WaypointBudget = {
  stay: 0,
  food: 0,
  transport: 0,
  activities: 0,
};

export interface Waypoint {
  id: string;
  name: string;
  country?: string;
  lat: number;
  lng: number;
  /** Даты в формате ISO yyyy-mm-dd. */
  arrival?: string;
  departure?: string;
  note?: string;
  photo?: StoredFile | null;
  budget: WaypointBudget;
}

/** Сегмент соединяет waypoints[i] и waypoints[i + 1]. */
export interface RouteSegment {
  id: string;
  type: TransportType;
  price?: number;
  durationHours?: number;
}

export interface Trip {
  id?: string;
  ownerId: string;
  title: string;
  startDate?: string;
  endDate?: string;
  currency: string;
  /** Порядок в массиве = порядок маршрута. */
  waypoints: Waypoint[];
  segments: RouteSegment[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserProfile {
  email: string;
  displayName: string;
  settings: { currency: string };
  createdAt?: Timestamp | null;
}
