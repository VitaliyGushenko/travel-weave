import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { latLngToVec3, vec3ToLatLng } from '../core/geo';
import { RouteSegment, TransportType, Waypoint } from '../core/models';

export interface GlobeCallbacks {
  /** Клик по маркеру точки. */
  onWaypointClick: (index: number) => void;
  /** Клик по глобусу в режиме добавления. */
  onGlobeClick: (lat: number, lng: number) => void;
  /** Наведение на маркер: экранные координаты относительно контейнера. */
  onHover: (hover: { index: number; x: number; y: number } | null) => void;
}

interface Thread {
  key: string;
  line: Line2 | THREE.Points;
  material: LineMaterial | THREE.PointsMaterial;
  points: THREE.Vector3[];
  createdAt: number;
  sparks?: { points: THREE.Points; positions: Float32Array; t: number; speed: number };
}

interface Marker {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Sprite;
  hit: THREE.Mesh;
  index: number;
}

const THREAD_COLORS: Record<TransportType, number> = {
  flight: 0xf2b64c,
  train: 0x3fd8c7,
  car: 0x3fd8c7,
  cruise: 0x6ea8ff,
  walk: 0xdfe8ff,
};

const THREAD_WIDTHS: Record<TransportType, number> = {
  flight: 2.6,
  train: 2.2,
  car: 2.2,
  cruise: 2.4,
  walk: 1.4,
};

const CAMERA_MIN_DIST = 1.35;
const CAMERA_MAX_DIST = 5;

/** Движок глобуса: чистый Three.js вне Angular-зоны. */
export class GlobeScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly earthUniforms: Record<string, THREE.IUniform>;
  private readonly earth: THREE.Mesh;

  private readonly markersGroup = new THREE.Group();
  private readonly threadsGroup = new THREE.Group();
  private readonly markers: Marker[] = [];
  private readonly threads: Thread[] = [];

  private readonly glowTexture: THREE.Texture;
  private readonly ringTexture: THREE.Texture;
  private readonly flashes: { sprite: THREE.Sprite; start: number }[] = [];
  private frameId = 0;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  // Состояние камеры: смотрим на точку (camLat, camLng) с расстояния camDist.
  private camLat = 30;
  private camLng = 40;
  private camDist = 3.2;
  private vLat = 0;
  private vLng = 0;
  private targetDist = this.camDist;
  private autoRotate = true;

  // Перетаскивание.
  private dragging = false;
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  private lastInteract = 0;
  private hoverIndex: number | null = null;

  // Анимация подлёта.
  private flyFrom: { lat: number; lng: number; dist: number } | null = null;
  private flyTo: { lat: number; lng: number; dist: number } | null = null;
  private flyStart = 0;

  private addMode = false;
  private selected: number | null = null;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: GlobeCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.01,
      200,
    );

    this.glowTexture = createGlowTexture();
    this.ringTexture = createRingTexture();
    this.earthUniforms = {
      dayTexture: { value: loadTexture('textures/earth-day.jpg') },
      nightTexture: { value: loadTexture('textures/earth-night.jpg') },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    };

    this.scene.add(createStars());
    this.earth = createEarth(this.earthUniforms);
    this.scene.add(this.earth);
    this.scene.add(createAtmosphere());
    this.scene.add(this.markersGroup);
    this.scene.add(this.threadsGroup);

    this.attachEvents();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.updateCamera();
    this.animate();
  }

  // ---------- Публичный API ----------

  setWaypoints(list: Waypoint[]): void {
    this.rebuildMarkers(list);
  }

  setThreads(waypoints: Waypoint[], segments: RouteSegment[]): void {
    this.rebuildThreads(waypoints, segments);
  }

  setSelected(index: number | null, fly = false): void {
    this.selected = index;
    if (fly && index !== null && this.markers[index]) {
      const pos = this.markers[index].group.position;
      this.flyToLatLng(vec3ToLatLng(pos.clone().normalize()));
    }
  }

  setAddMode(on: boolean): void {
    this.addMode = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }

  zoomIn(): void {
    this.targetDist = clamp(this.targetDist - 0.45, CAMERA_MIN_DIST, CAMERA_MAX_DIST);
  }

  zoomOut(): void {
    this.targetDist = clamp(this.targetDist + 0.45, CAMERA_MIN_DIST, CAMERA_MAX_DIST);
  }

  /** Вспышка с расходящимися кругами при добавлении точки. */
  flashAt(lat: number, lng: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.ringTexture,
        color: 0x6ff0dc,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.copy(latLngToVec3(lat, lng, 1.015));
    this.scene.add(sprite);
    this.flashes.push({ sprite, start: performance.now() });
  }

  flyToLatLng(target: { lat: number; lng: number }, dist?: number): void {
    // Кратчайший путь по долготе.
    const deltaLng = mod180(target.lng - this.camLng);
    const d = dist ?? Math.min(this.camDist, 2.4);
    this.flyFrom = { lat: this.camLat, lng: this.camLng, dist: this.camDist };
    this.flyTo = { lat: clamp(target.lat, -80, 80), lng: this.camLng + deltaLng, dist: clamp(d, CAMERA_MIN_DIST, CAMERA_MAX_DIST) };
    this.flyStart = performance.now();
    this.autoRotate = false;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.detachEvents();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
    this.glowTexture.dispose();
    this.ringTexture.dispose();
    (this.earthUniforms['dayTexture'].value as THREE.Texture).dispose();
    (this.earthUniforms['nightTexture'].value as THREE.Texture).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- Построение сцены ----------

  private rebuildMarkers(list: Waypoint[]): void {
    for (const m of this.markers) {
      this.markersGroup.remove(m.group);
      m.core.geometry.dispose();
      (m.core.material as THREE.Material).dispose();
      m.hit.geometry.dispose();
      (m.hit.material as THREE.Material).dispose();
      m.glow.material.dispose();
    }
    this.markers.length = 0;

    list.forEach((wp, index) => {
      const group = new THREE.Group();
      group.position.copy(latLngToVec3(wp.lat, wp.lng, 1.012));

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.011, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: index === this.selected ? 0xf2b64c : 0x3fd8c7,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.setScalar(0.07);
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      group.add(core, glow, hit);
      this.markersGroup.add(group);
      this.markers.push({ group, core, glow, hit, index });
    });
  }

  private rebuildThreads(waypoints: Waypoint[], segments: RouteSegment[]): void {
    const keep = new Set<string>();
    for (let i = 0; i < waypoints.length - 1; i++) {
      const seg = segments[i];
      if (!seg) {
        continue;
      }
      const key = `${waypoints[i].id}>${waypoints[i + 1].id}:${seg.type}`;
      keep.add(key);
      if (this.threads.some((t) => t.key === key)) {
        continue;
      }
      this.threads.push(
        this.createThread(key, waypoints[i], waypoints[i + 1], seg, performance.now()),
      );
    }
    // Убираем нити, которые больше не нужны (удалены/переставлены точки).
    for (let i = this.threads.length - 1; i >= 0; i--) {
      if (!keep.has(this.threads[i].key)) {
        this.removeThread(this.threads[i]);
        this.threads.splice(i, 1);
      }
    }
  }

  private createThread(
    key: string,
    from: Waypoint,
    to: Waypoint,
    seg: RouteSegment,
    now: number,
  ): Thread {
    const points = buildThreadPoints(from, to, seg.type);
    const flat: number[] = [];
    for (const p of points) {
      flat.push(p.x, p.y, p.z);
    }

    if (seg.type === 'walk') {
      // Пешком — тонкая точечная нить из частиц.
      const positions = new Float32Array(flat);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: THREAD_COLORS[seg.type],
        size: 0.012,
        map: this.glowTexture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts = new THREE.Points(geometry, material);
      pts.geometry.setDrawRange(0, 2);
      this.threadsGroup.add(pts);
      return { key, line: pts, material, points, createdAt: now };
    }

    const geometry = new LineGeometry();
    geometry.setPositions(flat);
    if (seg.type === 'car') {
      // Градиентная нить: бирюза → золото.
      const colors: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const t = i / (points.length - 1);
        const c = new THREE.Color(0x3fd8c7).lerp(new THREE.Color(0xf2b64c), t);
        colors.push(c.r, c.g, c.b);
      }
      geometry.setColors(colors);
    }
    const material = new LineMaterial({
      color: THREAD_COLORS[seg.type],
      linewidth: THREAD_WIDTHS[seg.type],
      worldUnits: false,
      vertexColors: seg.type === 'car',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      dashed: seg.type === 'train' || seg.type === 'cruise',
      dashSize: seg.type === 'train' ? 0.06 : 0.03,
      gapSize: seg.type === 'train' ? 0.035 : 0.02,
      depthWrite: false,
    });
    material.resolution.set(this.container.clientWidth, this.container.clientHeight);
    const line = new Line2(geometry, material);
    if (material.dashed) {
      line.computeLineDistances();
    }
    geometry.instanceCount = 2; // нить начнёт прорисовываться
    this.threadsGroup.add(line);

    const thread: Thread = { key, line, material, points, createdAt: now };
    if (seg.type === 'flight' && points.length > 2) {
      thread.sparks = this.createSparks(points);
    }
    return thread;
  }

  private createSparks(points: THREE.Vector3[]): NonNullable<Thread['sparks']> {
    const count = 2;
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sparks = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffe9b0,
        size: 0.035,
        map: this.glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.threadsGroup.add(sparks);
    return {
      points: sparks,
      positions,
      t: Math.random(),
      speed: 0.12 + Math.random() * 0.08,
    };
  }

  private removeThread(thread: Thread): void {
    this.threadsGroup.remove(thread.line);
    if (thread.sparks) {
      this.threadsGroup.remove(thread.sparks.points);
      thread.sparks.points.geometry.dispose();
      (thread.sparks.points.material as THREE.Material).dispose();
    }
    thread.line.geometry.dispose();
    thread.material.dispose();
  }

  // ---------- События ----------

  private attachEvents(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detachEvents(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.dragMoved = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.vLat = 0;
    this.vLng = 0;
    this.lastInteract = performance.now();
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.lastInteract = performance.now();
    if (this.dragging) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        this.dragMoved = true;
      }
      const k = 0.22 * (this.camDist / 3);
      this.camLng -= dx * k;
      this.camLat = clamp(this.camLat + dy * k, -85, 85);
      this.vLng = -dx * k;
      this.vLat = dy * k;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.flyFrom = null;
      this.flyTo = null;
      return;
    }
    this.updateHover(e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.lastInteract = performance.now();
    if (this.dragMoved) {
      return;
    }
    const hit = this.pickMarker(e);
    if (hit !== null) {
      this.callbacks.onWaypointClick(hit);
      return;
    }
    const globePoint = this.pickGlobe(e);
    if (globePoint && this.addMode) {
      this.callbacks.onGlobeClick(globePoint.lat, globePoint.lng);
    }
  };

  private onPointerLeave = (): void => {
    this.dragging = false;
    if (this.hoverIndex !== null) {
      this.hoverIndex = null;
      this.callbacks.onHover(null);
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.lastInteract = performance.now();
    this.targetDist = clamp(
      this.targetDist * (1 + Math.sign(e.deltaY) * 0.12),
      CAMERA_MIN_DIST,
      CAMERA_MAX_DIST,
    );
  };

  private updateHover(e: PointerEvent): void {
    const hit = this.pickMarker(e);
    if (hit !== this.hoverIndex) {
      this.hoverIndex = hit;
      this.renderer.domElement.style.cursor = hit !== null ? 'pointer' : this.addMode ? 'crosshair' : 'grab';
    }
    if (hit !== null) {
      const rect = this.container.getBoundingClientRect();
      const marker = this.markers[hit];
      const projected = marker.group.position.clone().project(this.camera);
      this.callbacks.onHover({
        index: hit,
        x: ((projected.x + 1) / 2) * rect.width,
        y: ((1 - projected.y) / 2) * rect.height,
      });
    } else {
      this.callbacks.onHover(null);
    }
  }

  private setPointerFromEvent(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private pickMarker(e: PointerEvent): number | null {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.markers.map((m) => m.hit), false);
    if (hits.length === 0) {
      return null;
    }
    const index = this.markers.find((m) => m.hit === hits[0].object)?.index ?? null;
    if (index === null) {
      return null;
    }
    // Отсекаем маркеры на обратной стороне глобуса.
    const markerPos = this.markers[index].group.position.clone().normalize();
    const camDir = this.camera.position.clone().normalize();
    return markerPos.dot(camDir) > 0.15 ? index : null;
  }

  private pickGlobe(e: PointerEvent): { lat: number; lng: number } | null {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.earth, false);
    return hits.length ? vec3ToLatLng(hits[0].point) : null;
  }

  // ---------- Кадр ----------

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) {
      return;
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    for (const t of this.threads) {
      const mat = t.material;
      if (mat instanceof LineMaterial) {
        mat.resolution.set(w, h);
      }
    }
  }

  private updateCamera(): void {
    this.camera.position.copy(latLngToVec3(this.camLat, this.camLng, this.camDist));
    this.camera.lookAt(0, 0, 0);
  }

  private animate = (): void => {
    if (this.disposed) {
      return;
    }
    this.frameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.1);

    // Инерция вращения.
    if (!this.dragging) {
      this.camLng += this.vLng;
      this.camLat = clamp(this.camLat + this.vLat, -85, 85);
      this.vLng *= 0.93;
      this.vLat *= 0.93;
      // Лёгкое автовращение в простое — глобус живёт сам по себе.
      if (now - this.lastInteract > 6000) {
        this.autoRotate = true;
      }
      if (this.autoRotate) {
        this.camLng -= dt * 1.2;
      }
    }

    // Подлёт к точке.
    if (this.flyFrom && this.flyTo) {
      const t = clamp((now - this.flyStart) / 950, 0, 1);
      const e = easeInOutCubic(t);
      this.camLat = lerp(this.flyFrom.lat, this.flyTo.lat, e);
      this.camLng = lerp(this.flyFrom.lng, this.flyTo.lng, e);
      this.camDist = lerp(this.flyFrom.dist, this.flyTo.dist, e);
      if (t >= 1) {
        this.flyFrom = null;
        this.flyTo = null;
      }
    } else {
      // Плавный зум колесом.
      this.camDist = lerp(this.camDist, this.targetDist, 1 - Math.pow(0.001, dt));
    }

    this.updateCamera();

    // Солнце по реальному времени UTC.
    this.earthUniforms['sunDirection'].value.copy(subsolarDirection());

    // Вспышки добавления точек.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const t = (now - f.start) / 750;
      if (t >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      f.sprite.scale.setScalar(0.04 + t * 0.32);
      (f.sprite.material as THREE.SpriteMaterial).opacity = 1 - t;
    }

    // Пульс выбранного маркера.
    const pulse = 1 + 0.25 * Math.sin(now * 0.006);
    this.markers.forEach((m, i) => {
      const selectedOrHover = i === this.selected || i === this.hoverIndex;
      m.glow.scale.setScalar(selectedOrHover ? 0.11 * pulse : 0.065);
      (m.glow.material as THREE.SpriteMaterial).color.setHex(
        i === this.selected ? 0xf2b64c : i === this.hoverIndex ? 0x9ff3e8 : 0x3fd8c7,
      );
      (m.core.material as THREE.MeshBasicMaterial).color.setHex(
        i === this.selected || i === this.hoverIndex ? 0xffe9b0 : 0xffffff,
      );
    });

    // Прорисовка нитей и искры.
    for (const t of this.threads) {
      if (t.line instanceof THREE.Points) {
        const target = t.points.length;
        const current = t.line.geometry.drawRange.count;
        if (current < target) {
          const age = (now - t.createdAt) / 1000;
          t.line.geometry.setDrawRange(0, Math.min(target, Math.max(2, Math.floor((target * age) / 0.9))));
        }
      } else {
        const total = countFromGeometry(t);
        if (t.line.geometry.instanceCount < total) {
          const age = (now - t.createdAt) / 1000;
          t.line.geometry.instanceCount = Math.max(2, Math.min(total, Math.floor((total * age) / 0.9)));
        }
      }
      if (t.sparks) {
        t.sparks.t = (t.sparks.t + dt * t.sparks.speed) % 1;
        for (let s = 0; s < 2; s++) {
          const f = (t.sparks.t + s * 0.5) % 1;
          const p = pointAtFraction(t.points, f);
          t.sparks.positions[s * 3] = p.x;
          t.sparks.positions[s * 3 + 1] = p.y;
          t.sparks.positions[s * 3 + 2] = p.z;
        }
        (t.sparks.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}

// ---------- Вспомогательные функции ----------

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Нормализация разницы долгот в диапазон (-180, 180]. */
function mod180(d: number): number {
  return ((d + 540) % 360) - 180;
}

function loadTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function countFromGeometry(t: Thread): number {
  // LineGeometry хранит сегменты как инстансы: instanceStart/instanceEnd.
  const attr = (t.line as Line2).geometry.getAttribute('instanceStart') as THREE.BufferAttribute | undefined;
  return attr ? attr.count : 2;
}

function pointAtFraction(points: THREE.Vector3[], f: number): THREE.Vector3 {
  const idx = f * (points.length - 1);
  const i = Math.floor(idx);
  const a = points[i];
  const b = points[Math.min(i + 1, points.length - 1)];
  return new THREE.Vector3().lerpVectors(a, b, idx - i);
}

/** Точка под солнцем по текущему времени UTC. */
function subsolarDirection(): THREE.Vector3 {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000,
  );
  const declination = -23.44 * Math.cos(((2 * Math.PI) * (dayOfYear + 10)) / 365);
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const lng = -15 * (utcHours - 12);
  return latLngToVec3(declination, lng, 1).normalize();
}

/** Сфера Земли с шейдером день/ночь и атмосферным ободком. */
function createEarth(uniforms: Record<string, THREE.IUniform>): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float sunDot = dot(normalize(vNormal), normalize(sunDirection));
        float dayness = smoothstep(-0.12, 0.25, sunDot);
        vec3 dayColor = texture2D(dayTexture, vUv).rgb;
        vec3 nightColor = texture2D(nightTexture, vUv).rgb * 1.45;
        vec3 color = mix(nightColor, dayColor, dayness);
        // Тёплая полоса заката вдоль терминатора.
        float twilight = smoothstep(-0.12, 0.02, sunDot) * (1.0 - smoothstep(0.02, 0.3, sunDot));
        color += vec3(0.85, 0.45, 0.2) * twilight * 0.22;
        // Атмосферный ободок (fresnel).
        float fresnel = pow(1.0 - max(dot(vViewDir, normalize(vNormal)), 0.0), 2.8);
        color += vec3(0.22, 0.5, 0.62) * fresnel * (0.55 + 0.45 * dayness);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), material);
}

/** Внешнее атмосферное свечение (BackSide, additive). */
function createAtmosphere(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
        gl_FragColor = vec4(0.24, 0.55, 0.75, 1.0) * clamp(intensity, 0.0, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 64), material);
}

/** Процедурное звёздное поле с лёгкой вариацией цвета. */
function createStars(): THREE.Points {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(40 + Math.random() * 50);
    positions.set([v.x, v.y, v.z], i * 3);
    const shade = 0.55 + Math.random() * 0.45;
    const warm = Math.random() < 0.18;
    colors.set(warm ? [shade, shade * 0.85, shade * 0.65] : [shade * 0.8, shade * 0.9, shade], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true }),
  );
}

/** Точки нити: дуга большого круга с вариациями по типу транспорта. */
function buildThreadPoints(from: Waypoint, to: Waypoint, type: TransportType): THREE.Vector3[] {
  const a = { lat: from.lat, lng: from.lng };
  const b = { lat: to.lat, lng: to.lng };
  const segments = 72;
  const pts: THREE.Vector3[] = [];
  if (type === 'flight') {
    const dist = Math.abs(a.lat - b.lat) + Math.abs(mod180(b.lng - a.lng));
    const altitude = clamp(dist / 220, 0.08, 0.35);
    return greatCircle(a, b, segments, altitude);
  }
  // Наземные/морские маршруты прижимаем к поверхности.
  const altitude = type === 'cruise' ? 0.012 : 0.02;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const base = greatCirclePoint(a, b, t);
    let r = 1 + altitude;
    if (type === 'cruise') {
      // Волна вдоль пути.
      r += 0.006 * Math.sin(t * Math.PI * 14);
    }
    pts.push(base.normalize().multiplyScalar(r));
  }
  return pts;
}

function greatCircle(a: { lat: number; lng: number }, b: { lat: number; lng: number }, segments: number, altitude: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const v = greatCirclePoint(a, b, t);
    pts.push(v.normalize().multiplyScalar(1 + altitude * Math.sin(Math.PI * t)));
  }
  return pts;
}

function greatCirclePoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number,
): THREE.Vector3 {
  const start = latLngToVec3(a.lat, a.lng, 1);
  const end = latLngToVec3(b.lat, b.lng, 1);
  const angle = start.angleTo(end);
  if (angle < 0.001) {
    return start.clone().lerp(end, t);
  }
  const sinA = Math.sin((1 - t) * angle) / Math.sin(angle);
  const sinB = Math.sin(t * angle) / Math.sin(angle);
  return start.multiplyScalar(sinA).add(end.multiplyScalar(sinB));
}

/** Мягкая круглая текстура для свечения/искр. */
function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Тонкое кольцо для эффекта «расходящихся кругов». */
function createRingTexture(): THREE.Texture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
