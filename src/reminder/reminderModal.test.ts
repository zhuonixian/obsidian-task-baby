import { ReminderModal } from './reminderModal';
import type { PresentModalOptions } from './reminderModal';

function makeOptions(
  overrides: Partial<PresentModalOptions> = {}
): PresentModalOptions & { onSnooze: jest.Mock; onFinal: jest.Mock } {
  return {
    message: '⏰ 今日还有 3 件未完成',
    snoozeRemaining: 3,
    snoozeMinutes: 10,
    onSnooze: jest.fn(),
    onFinal: jest.fn(),
    ...overrides
  } as any;
}

function openModal(options: PresentModalOptions): ReminderModal {
  const modal = new ReminderModal({} as any, options);
  modal.onOpen();
  return modal;
}

function buttonsOf(modal: ReminderModal): HTMLButtonElement[] {
  const contentChildren = (modal.contentEl as any).children as HTMLElement[];
  const buttonRow = contentChildren.find(c => c.querySelectorAll?.('button').length);
  return buttonRow ? Array.from(buttonRow.querySelectorAll('button')) : [];
}

describe('ReminderModal', () => {
  test('snoozeRemaining > 0 → 两按钮,文案含间隔与剩余次数', () => {
    const modal = openModal(makeOptions());
    const buttons = buttonsOf(modal);
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('稍后 10 分钟');
    expect(buttons[0].textContent).toContain('还可 3 次');
    expect(buttons[1].textContent).toBe('今日完成');
  });

  test('snoozeRemaining = 0 → 仅「今日完成」', () => {
    const modal = openModal(makeOptions({ snoozeRemaining: 0 }));
    const buttons = buttonsOf(modal);
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe('今日完成');
  });

  test('message 渲染进内容区', () => {
    const options = makeOptions();
    const modal = openModal(options);
    const texts = ((modal.contentEl as any).children as HTMLElement[])
      .map(c => c.textContent ?? '').join('\n');
    expect(texts).toContain('⏰ 今日还有 3 件未完成');
  });

  test('点「稍后」→ onSnooze 一次,onFinal 不调用;随后 onClose 不重复', () => {
    const options = makeOptions();
    const modal = openModal(options);
    buttonsOf(modal)[0].dispatchEvent(new MouseEvent('click'));
    expect(options.onSnooze).toHaveBeenCalledTimes(1);
    expect(options.onFinal).not.toHaveBeenCalled();
    modal.onClose();
    expect(options.onSnooze).toHaveBeenCalledTimes(1);
  });

  test('点「今日完成」→ onFinal 一次,onSnooze 不调用;随后 onClose 不重复', () => {
    const options = makeOptions();
    const modal = openModal(options);
    buttonsOf(modal)[1].dispatchEvent(new MouseEvent('click'));
    expect(options.onFinal).toHaveBeenCalledTimes(1);
    expect(options.onSnooze).not.toHaveBeenCalled();
    modal.onClose();
    expect(options.onFinal).toHaveBeenCalledTimes(1);
  });

  test('直接 onClose(模拟 ESC/背景关闭)→ onFinal 恰好一次', () => {
    const options = makeOptions();
    const modal = openModal(options);
    modal.onClose();
    modal.onClose();
    expect(options.onFinal).toHaveBeenCalledTimes(1);
    expect(options.onSnooze).not.toHaveBeenCalled();
  });
});
