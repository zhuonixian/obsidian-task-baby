// src/data/fileScanner.ts
import type { Vault, TFile } from 'obsidian';
import type { TaskBoardSettings } from '../types';
import { computeWindowStart, parseFilenameDate } from '../utils/dateUtils';

export interface MatchedFile {
  file: TFile;
  sourceDate: Date;
}

export interface ScanResult {
  matched: MatchedFile[];
  unparsed: TFile[];
}

// 把 filePattern 转成正则 + 解析器
// 仅支持 YYYY MM DD 的子集（v1 够用）
function patternToRegex(pattern: string): { regex: RegExp; parseFromName: (name: string) => Date | null } {
  if (pattern === 'YYYY-MM-DD.md') {
    return {
      regex: /^\d{4}-\d{2}-\d{2}\.md$/,
      parseFromName: (name) => parseFilenameDate(name.replace(/\.md$/, ''))
    };
  }
  if (pattern === 'MMMM-D-YYYY.md') {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return {
      regex: /^[A-Za-z]+-\d{1,2}-\d{4}\.md$/,
      parseFromName: (name) => {
        const m = name.replace(/\.md$/, '').match(/^([A-Za-z]+)-(\d{1,2})-(\d{4})$/);
        if (!m) return null;
        const monthIdx = MONTHS.indexOf(m[1]);
        if (monthIdx < 0) return null;
        const day = Number(m[2]);
        if (day < 1 || day > 31) return null;
        const d = new Date(Number(m[3]), monthIdx, day);
        // Catch JS Date rollover (e.g., June-31 → July 1)
        if (d.getMonth() !== monthIdx) return null;
        return d;
      }
    };
  }
  // Fallback: try YYYY-MM-DD
  return {
    regex: /^\d{4}-\d{2}-\d{2}\.md$/,
    parseFromName: (name) => parseFilenameDate(name.replace(/\.md$/, ''))
  };
}

export function listDailyFiles(
  vault: Vault,
  settings: TaskBoardSettings,
  today: Date
): ScanResult {
  const { regex, parseFromName } = patternToRegex(settings.filePattern);
  const windowStart = computeWindowStart(today, settings.rangeDays);

  const all = vault.getMarkdownFiles();
  const matched: MatchedFile[] = [];
  const unparsed: TFile[] = [];

  for (const file of all) {
    if (!file.path.startsWith(settings.dailyDir + '/')) {
      continue;
    }
    const basename = file.path.split('/').pop() ?? '';
    if (!regex.test(basename)) {
      unparsed.push(file);
      continue;
    }
    const sourceDate = parseFromName(basename);
    if (!sourceDate) {
      unparsed.push(file);
      continue;
    }
    if (sourceDate < windowStart || sourceDate > today) {
      continue;
    }
    matched.push({ file, sourceDate });
  }

  matched.sort((a, b) => a.sourceDate.getTime() - b.sourceDate.getTime());
  return { matched, unparsed };
}
