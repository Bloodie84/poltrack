#!/usr/bin/env node
/**
 * Génère les icônes PNG de la PWA sans dépendance graphique.
 *
 * Les icônes sont dessinées pixel par pixel puis encodées en PNG via zlib :
 * pas de binaire natif à installer, et le résultat est reproductible.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BACKGROUND = [7, 11, 18];
const ACCENT = [56, 189, 248];
const ACCENT_DIM = [14, 116, 144];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode un buffer RGBA (size × size) en PNG. */
function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filtre "None"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Motif : disque de détection stylisé (anneau + tige) sur fond sombre.
 * `padding` réserve la zone sûre exigée par les icônes maskables.
 */
function draw(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const safe = maskable ? 0.72 : 0.86;
  const ringOuter = (size / 2) * safe * 0.78;
  const ringInner = ringOuter * 0.66;
  const cornerRadius = maskable ? 0 : size * 0.22;

  const put = (x, y, [r, g, b], alpha) => {
    const index = (y * size + x) * 4;
    const previousAlpha = rgba[index + 3] / 255;
    const outAlpha = alpha + previousAlpha * (1 - alpha);
    if (outAlpha === 0) return;
    for (let channel = 0; channel < 3; channel += 1) {
      const previous = rgba[index + channel];
      const source = [r, g, b][channel];
      rgba[index + channel] = Math.round(
        (source * alpha + previous * previousAlpha * (1 - alpha)) / outAlpha,
      );
    }
    rgba[index + 3] = Math.round(outAlpha * 255);
  };

  // Anticrénelage : couverture estimée à partir de la distance au bord.
  const coverage = (distance, edge) => Math.max(0, Math.min(1, edge - distance + 0.5));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Fond : carré à coins arrondis (icône classique) ou plein (maskable).
      let backgroundAlpha = 1;
      if (cornerRadius > 0) {
        const dx = Math.max(cornerRadius - px, px - (size - cornerRadius), 0);
        const dy = Math.max(cornerRadius - py, py - (size - cornerRadius), 0);
        backgroundAlpha = coverage(Math.hypot(dx, dy), cornerRadius);
      }
      if (backgroundAlpha > 0) put(x, y, BACKGROUND, backgroundAlpha);

      const distance = Math.hypot(px - center, py - center * 1.06);

      // Anneau du disque.
      const ringAlpha =
        Math.min(coverage(distance, ringOuter), coverage(ringInner, distance + 1)) *
        (distance >= ringInner ? 1 : 0);
      if (ringAlpha > 0) put(x, y, ACCENT, ringAlpha);

      // Tige, remontant du disque vers le haut de l'icône.
      const stemHalfWidth = size * 0.035;
      const inStem =
        Math.abs(px - center) <= stemHalfWidth &&
        py <= center * 1.06 - ringInner * 0.2 &&
        py >= size * 0.16;
      if (inStem) put(x, y, ACCENT_DIM, 1);
    }
  }

  return rgba;
}

mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

for (const { file, size, maskable } of targets) {
  writeFileSync(join(outDir, file), encodePng(draw(size, { maskable }), size));
  console.log(`  ✔ public/icons/${file} (${size}×${size})`);
}
