// __fixtures__/vault-30d/setup.ts
import { TFile, Vault } from 'obsidian';

export function buildVault30d(): Vault {
  const vault = new Vault();
  const today = new Date(2026, 5, 14);

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const path = `DailyLife/${y}/${m}/${y}-${m}-${dd}.md`;
    const file = new TFile(path, `${y}-${m}-${dd}`, 'md');
    vault.files.push(file);
    vault.contents[path] = generateDayContent(d, i);
  }
  return vault;
}

function generateDayContent(d: Date, daysAgo: number): string {
  const lines: string[] = [`# ${d.toDateString()}`, ''];
  // 每天 2-3 个未完成 + 1-2 个已完成
  lines.push(`- [ ] 任务-${daysAgo}-A 📅 2026-06-${20 + (daysAgo % 5)}`);
  lines.push(`- [ ] 任务-${daysAgo}-B #work`);
  if (daysAgo % 2 === 0) {
    lines.push(`- [ ] 任务-${daysAgo}-C 🔼`);
  }
  lines.push(`- [x] 完成-${daysAgo}-1 ✅ ${formatDate(d)}`);
  if (daysAgo % 3 === 0) {
    lines.push(`- [x] 完成-${daysAgo}-2 ✅ ${formatDate(d)}`);
  }
  return lines.join('\n') + '\n';
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
