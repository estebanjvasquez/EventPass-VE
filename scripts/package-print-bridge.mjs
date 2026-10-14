import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Produce a portable ZIP without dependencies, using an explicit source allowlist.
const root = new URL('../print-bridge/', import.meta.url);
const files = ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json',
  'instalar-windows.ps1', 'iniciar-bridge.cmd', 'desinstalar-inicio-automatico.ps1'];
for (const name of (await readdir(new URL('src/', root))).sort()) {
  if (name.endsWith('.ts')) files.push(`src/${name}`);
}
const local = [], central = [];
let offset = 0;
for (const file of files) {
  const data = await readFile(new URL(file, root));
  const name = Buffer.from(`eventosfacil-print-bridge/${file}`);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(33, 12); // 1980-01-01, deterministic archive timestamp.
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(33, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const target = new URL('../frontend/public/downloads/eventosfacil-print-bridge-windows.zip', import.meta.url);
await mkdir(new URL('./', target), { recursive: true });
await writeFile(target, Buffer.concat([...local, directory, end]));
console.log(`Conector Windows: ${files.length} archivos → ${fileURLToPath(target)}`);
