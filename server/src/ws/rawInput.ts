/** Preserve mouse protocol bytes as well as UTF-8 keyboard input. */
export function rawInput(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(String(data), 'utf8');
}
