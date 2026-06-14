// src/utils/domHelpers.ts
export interface HProps {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
  onclick?: (ev: MouseEvent) => void;
  title?: string;
  [k: string]: any;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps | null,
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props) {
    if (props.cls) el.className = props.cls;
    if (props.text != null) el.textContent = props.text;
    if (props.title != null) el.title = props.title;
    if (props.attr) {
      for (const [k, v] of Object.entries(props.attr)) {
        el.setAttribute(k, v);
      }
    }
    if (props.onclick) {
      (el as any).onclick = props.onclick;
    }
    // 其他自定义 prop
    for (const [k, v] of Object.entries(props)) {
      if (['cls','text','attr','onclick','title'].includes(k)) continue;
      if (typeof v === 'function') {
        (el as any)[k] = v;
      }
    }
  }

  for (const child of children) {
    if (child == null) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
