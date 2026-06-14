// src/utils/domHelpers.test.ts
import { JSDOM } from 'jsdom';

// 测试环境补 jsdom
const dom = new JSDOM('<!doctype html><html><body></body></html>');
(global as any).document = dom.window.document;

import { h } from './domHelpers';

describe('domHelpers.h', () => {
  test('creates element with tag', () => {
    const el = h('div');
    expect(el.tagName).toBe('DIV');
  });

  test('applies className', () => {
    const el = h('div', { cls: 'foo bar' });
    expect(el.className).toBe('foo bar');
  });

  test('sets text content', () => {
    const el = h('span', { text: 'hello' });
    expect(el.textContent).toBe('hello');
  });

  test('attaches event handler', () => {
    const handler = jest.fn();
    const el = h('button', { onclick: handler }) as any;
    el.onclick();
    expect(handler).toHaveBeenCalled();
  });

  test('appends children', () => {
    const child1 = h('span', { text: 'a' });
    const child2 = h('span', { text: 'b' });
    const parent = h('div', null, child1, child2);
    expect(parent.children.length).toBe(2);
  });

  test('sets attributes via attr', () => {
    const el = h('a', { attr: { href: '#x', target: '_blank' } }) as any;
    expect(el.getAttribute('href')).toBe('#x');
    expect(el.getAttribute('target')).toBe('_blank');
  });

  test('handles null props', () => {
    const el = h('div', null);
    expect(el.tagName).toBe('DIV');
  });
});
