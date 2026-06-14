// src/config/settingsTab.ts
import { App, Modal, PluginSettingTab, Setting, TFile } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { TaskBoardSettings } from '../types';
import { listDailyFiles } from '../data/fileScanner';

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
      .setName('测试匹配')
      .setDesc('预览最近匹配的日志文件，验证配置正确性')
      .addButton(btn => btn
        .setButtonText('预览最近 5 个匹配')
        .onClick(() => this.showPreview()));
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
