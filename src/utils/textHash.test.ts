// src/utils/textHash.test.ts
import { textHash, stripMeta } from './textHash';

describe('textHash', () => {
  test('stable for same input', () => {
    expect(textHash('hello world')).toBe(textHash('hello world'));
  });

  test('different for different input', () => {
    expect(textHash('hello')).not.toBe(textHash('world'));
  });

  test('empty string', () => {
    expect(textHash('')).toBe(textHash(''));
  });
});

describe('stripMeta', () => {
  test('removes due emoji + date', () => {
    expect(stripMeta('学 Rust 📅 2026-06-20')).toBe('学 Rust');
  });

  test('removes priority emoji', () => {
    expect(stripMeta('学 Rust 🔼')).toBe('学 Rust');
  });

  test('removes tags', () => {
    expect(stripMeta('学 Rust #p1 #work')).toBe('学 Rust');
  });

  test('preserves body across emoji mix', () => {
    expect(stripMeta('写周报 📅 2026-06-14 #work 🔼')).toBe('写周报');
  });

  test('empty body', () => {
    expect(stripMeta('📅 2026-06-14')).toBe('');
  });
});
