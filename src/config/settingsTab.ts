// src/config/settingsTab.ts
import { App, Modal, Notice, PluginSettingTab, Setting, TFile } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { TaskBoardSettings } from '../types';
import { listDailyFiles } from '../data/fileScanner';
import { getSnapshot } from '../data/snapshotService';
import { summarize, buildReminderMessage } from '../reminder/reminderService';
import { ReminderModal } from '../reminder/reminderModal';

export class TaskBoardSettingTab extends PluginSettingTab {
  plugin: TaskBoardPlugin;

  constructor(app: App, plugin: TaskBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('日志根目录')
      .setDesc('日志文件所在的 vault 目录路径，例如 DailyLife')
      .addText(text => text
        .setPlaceholder('DailyLife')
        .setValue(this.plugin.settings.dailyDir)
        .onChange(async v => {
          this.plugin.settings.dailyDir = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('文件名格式')
      .setDesc('YYYY-MM-DD.md 或 MMMM-D-YYYY.md（其他格式 v1 暂不支持）')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD.md')
        .setValue(this.plugin.settings.filePattern)
        .onChange(async v => {
          this.plugin.settings.filePattern = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('时间窗口（天）')
      .setDesc('面板默认显示最近多少天的日志')
      .addText(text => text
        .setPlaceholder('30')
        .setValue(String(this.plugin.settings.rangeDays))
        .onChange(async v => {
          const n = Number(v);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.rangeDays = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('解析 Tasks 插件元数据')
      .setDesc('解析 📅 ⏳ 🛫 ✅ 🔼 等 emoji 元数据')
      .addToggle(t => t
        .setValue(this.plugin.settings.enableTasksMetadata)
        .onChange(async v => {
          this.plugin.settings.enableTasksMetadata = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('勾选时追加 ✅ 完成日期')
      .setDesc('勾选任务时自动追加 ✅ YYYY-MM-DD')
      .addToggle(t => t
        .setValue(this.plugin.settings.appendDoneDate)
        .onChange(async v => {
          this.plugin.settings.appendDoneDate = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('侧栏简版积压上限')
      .setDesc('侧栏简版面板最多显示多少条历史积压')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.sidebarCompactLimit))
        .onChange(async v => {
          const n = Number(v);
          if (!isNaN(n) && n >= 0) {
            this.plugin.settings.sidebarCompactLimit = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('面板字体大小')
      .setDesc('面板基础字体大小（px，9-24，默认 13）')
      .addText(text => text
        .setPlaceholder('13')
        .setValue(String(this.plugin.settings.fontSize))
        .onChange(async v => {
          const n = Number(v);
          if (!isNaN(n) && n >= 9 && n <= 24) {
            this.plugin.settings.fontSize = n;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          }
        }));

    new Setting(containerEl)
      .setName('每日提醒')
      .setDesc('每天到提醒时刻自动检查未完成任务并弹出通知')
      .addToggle(t => t
        .setValue(this.plugin.settings.reminderEnabled)
        .onChange(async v => {
          this.plugin.settings.reminderEnabled = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('提醒时刻')
      .setDesc('每天检查的时刻(HH:mm,默认 21:00;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('21:00')
        .setValue(this.plugin.settings.reminderTime)
        .onChange(async v => {
          const trimmed = v.trim();
          const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
          if (!m) return;
          if (Number(m[1]) > 23 || Number(m[2]) > 59) return;
          this.plugin.settings.reminderTime = trimmed;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('提醒样式')
      .setDesc('弹窗(闹钟式,可稍后/完成)或通知条(弹一次即结束,贪睡配置无效)')
      .addDropdown(d => d
        .addOption('modal', '弹窗(闹钟式)')
        .addOption('notice', '通知条')
        .setValue(this.plugin.settings.reminderStyle)
        .onChange(async v => {
          this.plugin.settings.reminderStyle = v as TaskBoardSettings['reminderStyle'];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('贪睡间隔(分钟)')
      .setDesc('点「稍后」后隔多少分钟重新提醒(1-120,默认 10;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('10')
        .setValue(String(this.plugin.settings.reminderSnoozeMinutes))
        .onChange(async v => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 120) return;
          this.plugin.settings.reminderSnoozeMinutes = n;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('最大贪睡次数')
      .setDesc('超过后弹窗只显示「今日完成」(0-10,0 = 不可贪睡,默认 3;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('3')
        .setValue(String(this.plugin.settings.reminderMaxSnoozes))
        .onChange(async v => {
          if (v.trim() === '') return;
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 10) return;
          this.plugin.settings.reminderMaxSnoozes = n;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('测试匹配')
      .setDesc('预览最近匹配的日志文件，验证配置正确性')
      .addButton(btn => btn
        .setButtonText('预览最近 5 个匹配')
        .onClick(() => this.showPreview()));

    new Setting(containerEl)
      .setName('预览提醒弹窗')
      .setDesc('立即弹出提醒弹窗(基于当前任务计数),按钮不生效、不影响今日提醒调度')
      .addButton(btn => btn
        .setButtonText('预览弹窗')
        .onClick(() => this.showReminderPreview()));
  }

  private async showReminderPreview(): Promise<void> {
    const now = new Date();
    const snapshot = await getSnapshot(this.app.vault, this.plugin.settings, now);
    if (snapshot.errors.length > 0) {
      new Notice(`⚠ ${snapshot.errors.length} 个文件解析失败,请先检查日志配置`, 5000);
      return;
    }
    const message = buildReminderMessage(summarize(snapshot, now));
    if (message === null) {
      new Notice('当前扫描不到未完成/今日到期任务——请先用「测试匹配」确认日志目录配置', 8000);
      return;
    }
    new ReminderModal(this.app, {
      message,
      snoozeRemaining: Math.max(0, this.plugin.settings.reminderMaxSnoozes),
      snoozeMinutes: this.plugin.settings.reminderSnoozeMinutes,
      onSnooze: () => new Notice('预览模式:「稍后」不会生效', 3000),
      onFinal: () => new Notice('预览模式:「今日完成」不会生效', 3000)
    }).open();
  }

  private showPreview(): void {
    const today = new Date();
    const result = listDailyFiles(this.app.vault, this.plugin.settings, today);
    const paths = result.matched.slice(-5).reverse().map(m => m.file.path);
    const modal = new Modal(this.app);
    modal.titleEl.setText('匹配预览');
    const body = modal.contentEl;
    if (paths.length === 0) {
      body.createEl('p', { text: '未匹配到任何文件，请检查 dailyDir 和 filePattern。' });
    } else {
      body.createEl('p', { text: `共匹配 ${result.matched.length} 个，最近 5 个：` });
      const ul = body.createEl('ul');
      for (const p of paths) ul.createEl('li', { text: p });
    }
    if (result.unparsed.length > 0) {
      body.createEl('p', { text: `⚠ 还有 ${result.unparsed.length} 个文件未通过 pattern，已忽略。` });
    }
    modal.open();
  }
}
