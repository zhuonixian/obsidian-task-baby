// src/utils/textHash.ts
import type { Priority } from '../types';

// —— 元数据 strip ——
// 注意：和 TaskParser 使用同一份 emoji 表，更新时同步
const EMOJI_META_RE = /[\u{1F4C5}\u{23F3}\u{1F6EB}\u{2705}\u{1F501}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}]\s*\S*/gu;
const TAG_RE = /#[\w一-龥-]+/g;
const MULTI_WS_RE = /\s+/g;

export function stripMeta(body: string): string {
  return body
    .replace(EMOJI_META_RE, '')
    .replace(TAG_RE, '')
    .replace(MULTI_WS_RE, ' ')
    .trim();
}

// —— 简单字符串 hash（djb2）——
export function textHash(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0xffffffff; // Force 32-bit
  }
  return (hash >>> 0).toString(36);
}

// —— Priority 映射（Tasks 插件同款）——
export const PRIORITY_EMOJI: Record<string, Priority> = {
  '⏫': 'highest',
  '🔼': 'high',
  '🔽': 'low',
  '⏬': 'lowest'
};
