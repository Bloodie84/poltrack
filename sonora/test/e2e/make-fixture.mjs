/** Writes a short, real WAV file used as the upload fixture. */
import fs from 'node:fs';

const sampleRate = 44100;
const seconds = 6;
const channels = 1;
const frames = sampleRate * seconds;
const dataBytes = frames * channels * 2;

const buffer = Buffer.alloc(44 + dataBytes);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * 2, 28);
buffer.writeUInt16LE(channels * 2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < frames; i += 1) {
  const t = i / sampleRate;
  // A swelling chord so the waveform has a visible shape.
  const envelope = 0.25 + 0.7 * Math.abs(Math.sin((Math.PI * t) / seconds));
  const sample =
    envelope * (Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 330 * t) * 0.3);
  buffer.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32000, 44 + i * 2);
}

const out = process.argv[2] ?? 'test/e2e/fixtures/tone.wav';
fs.mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(out, buffer);
console.log(`wrote ${out} (${buffer.length} bytes)`);

/* A small, real PNG used as the cover fixture. */
import zlib from 'node:zlib';

function png(size = 96) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y += 1) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      raw[o++] = Math.round((x / size) * 90) + 10;
      raw[o++] = Math.round((y / size) * 200) + 30;
      raw[o++] = 180;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let table;
function crc32(buf) {
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

fs.writeFileSync('test/e2e/fixtures/cover.png', png());
fs.writeFileSync('test/e2e/fixtures/notes.txt', 'this is not audio');
console.log('wrote test/e2e/fixtures/cover.png and notes.txt');
