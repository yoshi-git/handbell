/**
 * A tiny XML reader, enough for MusicXML. Kept dependency-free so it runs both in
 * the browser and in Vitest (Node has no DOMParser).
 */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function fail(msg: string): never {
  throw new Error(`XML として解釈できません: ${msg}`);
}

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decode(src.slice(i));
      break;
    }
    if (lt > i) top.text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      if (end < 0) fail('コメントが閉じていません');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      if (end < 0) fail('CDATA が閉じていません');
      top.text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end < 0) fail('処理命令が閉じていません');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE (may contain an internal subset in [...]).
      let depth = 0;
      let j = lt + 2;
      for (; j < src.length; j++) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        else if (src[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) fail('終了タグが閉じていません');
      const name = src.slice(lt + 2, end).trim();
      if (stack.length < 2 || top.name !== name) fail(`</${name}> が対応していません`);
      stack.pop();
      i = end + 1;
    } else {
      const tag = /^<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(lt, lt + 4096));
      if (!tag) fail('開始タグが不正です');
      const el: XmlElement = { name: tag[1], attrs: {}, children: [], text: '' };
      for (const a of tag[2].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        el.attrs[a[1]] = decode(a[2] ?? a[3]);
      }
      top.children.push(el);
      if (!tag[3]) stack.push(el);
      i = lt + tag[0].length;
    }
  }
  if (stack.length > 1) fail(`<${stack[stack.length - 1].name}> が閉じていません`);
  return root;
}

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : [];
}

export function childText(el: XmlElement | undefined, name: string): string | undefined {
  const c = child(el, name);
  return c ? c.text.trim() : undefined;
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`);
}
