// src/reminder/reminderModal.ts
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { h } from '../utils/domHelpers';

export interface PresentModalOptions {
  message: string;
  snoozeRemaining: number;   // 0 → 只显示「今日完成」
  snoozeMinutes: number;
  onSnooze(): void;
  onFinal(): void;
}

export class ReminderModal extends Modal {
  private handled = false;

  constructor(app: App, private options: PresentModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('⏰ 任务提醒');
    this.contentEl.appendChild(h('p', {
      cls: 'tb-reminder-message',
      text: this.options.message
    }));
    const buttons = h('div', { cls: 'tb-reminder-buttons' });
    if (this.options.snoozeRemaining > 0) {
      buttons.appendChild(h('button', {
        cls: 'tb-reminder-snooze',
        text: `稍后 ${this.options.snoozeMinutes} 分钟(还可 ${this.options.snoozeRemaining} 次)`,
        onclick: () => this.handle(true)
      }));
    }
    buttons.appendChild(h('button', {
      cls: 'tb-reminder-final',
      text: '今日完成',
      onclick: () => this.handle(false)
    }));
    this.contentEl.appendChild(buttons);
  }

  onClose(): void {
    if (this.handled) return;
    this.handled = true;
    this.options.onFinal();
  }

  private handle(snooze: boolean): void {
    if (this.handled) return;
    this.handled = true;
    this.close();
    if (snooze) this.options.onSnooze();
    else this.options.onFinal();
  }
}
