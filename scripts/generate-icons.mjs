// Генератор иконок PWA: тёмный фон + бирюзовый глобус + золотая нить.
// Запуск: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.52;
  const r = size * 0.32;
  const r2 = size * 0.36; // орбита-нить
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // фон: светлый градиент
      const t = y / size;
      let rr = Math.round(244 - 10 * t);
      let gg = Math.round(247 - 6 * t);
      let bb = Math.round(251 - 3 * t);
      // глобус
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) {
        rr = 14; gg = 148; bb = 136; // teal
        // блик слева-сверху
        const edge = d / r;
        if (edge > 0.75) { rr = Math.round(rr * (1 - (edge - 0.75) * 2)); gg = Math.round(gg * (1 - (edge - 0.75) * 2)); bb = Math.round(bb * (1 - (edge - 0.75) * 2)); }
      }
      // золотая дуга-орбита
      const orbit = Math.abs(Math.hypot(x - cx, y - cy) - r2);
      const angle = Math.atan2(y - cy, x - cx);
      if (orbit < size * 0.022 && angle > -0.6 && angle < 2.2) {
        rr = 217; gg = 144; bb = 42; // gold
      }
      buf[i] = rr; buf[i + 1] = gg; buf[i + 2] = bb; buf[i + 3] = 255;
    }
  }
  return png(size, buf);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
console.log('icons written to public/icons/');
