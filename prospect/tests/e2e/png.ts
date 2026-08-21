import { inflateSync } from 'node:zlib';

export type Rgba = { r: number; g: number; b: number; a: number };

/**
 * Décodeur PNG minimal, suffisant pour les captures de Playwright
 * (8 bits par canal, RGB ou RGBA, non entrelacé).
 *
 * Il évite d'ajouter une dépendance d'image au projet, tout en permettant de
 * vérifier ce qui est RÉELLEMENT peint dans le canevas WebGL : c'est la seule
 * preuve qu'une couche cartographique s'affiche vraiment.
 */
export function decodePng(buffer: Buffer): {
  width: number;
  height: number;
  pixel: (x: number, y: number) => Rgba;
} {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Ce buffer n’est pas un PNG.');

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colorType = data[9];
      if (depth !== 8) throw new Error(`Profondeur ${depth} non gérée.`);
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`Type de couleur ${colorType} non géré.`);
      if (data[12] !== 0) throw new Error('PNG entrelacé non géré.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);

  // Défiltrage ligne à ligne (filtres PNG 0 à 4).
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];

      switch (filter) {
        case 0:
          break;
        case 1:
          value += left;
          break;
        case 2:
          value += up;
          break;
        case 3:
          value += Math.floor((left + up) / 2);
          break;
        case 4: {
          const p = left + up - upLeft;
          const dLeft = Math.abs(p - left);
          const dUp = Math.abs(p - up);
          const dUpLeft = Math.abs(p - upLeft);
          value += dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
          break;
        }
        default:
          throw new Error(`Filtre PNG ${filter} inconnu.`);
      }

      pixels[y * stride + x] = value & 0xff;
    }
  }

  return {
    width,
    height,
    pixel(x, y) {
      const index = y * stride + x * channels;
      return {
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
        a: channels === 4 ? pixels[index + 3] : 255,
      };
    },
  };
}

/** Distance euclidienne entre deux couleurs, canaux RVB. */
export function colorDistance(a: Rgba, b: Rgba): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function hexToRgba(hex: string): Rgba {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 255,
  };
}
