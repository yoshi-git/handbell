/** Minimal ZIP reader for compressed MusicXML (.mxl). Supports stored and deflate entries. */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // Find the end-of-central-directory record (it may be followed by a comment).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP ファイルではありません');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, () => Promise<Uint8Array>>();
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP の目次が壊れています');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    entries.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error(`未対応の圧縮形式です (${method})`);
    });
  }
  return entries;
}

/** Returns the score XML inside a compressed MusicXML (.mxl) file. */
export async function readMxl(buf: ArrayBuffer): Promise<string> {
  const entries = await readZip(buf);
  const utf8 = new TextDecoder();
  const container = entries.get('META-INF/container.xml');
  let path = container ? /full-path\s*=\s*"([^"]+)"/.exec(utf8.decode(await container()))?.[1] : undefined;
  path ??= [...entries.keys()].find((k) => !k.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(k));
  const entry = path ? entries.get(path) : undefined;
  if (!entry) throw new Error('MXL ファイルに楽譜が見つかりません');
  return decodeXmlBytes(await entry());
}

/** Decodes XML bytes, honouring a UTF-16 byte-order mark (some notation apps write UTF-16). */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder().decode(bytes);
}
