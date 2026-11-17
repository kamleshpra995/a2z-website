import type { MouseEvent } from 'react';

/** Props that open a record on double-click, ignoring double-clicks on interactive controls. */
export function doubleClickAction(open: (() => void) | null) {
  if (!open) return {};
  return {
    'data-double-click': '',
    onDoubleClick(event: MouseEvent<HTMLElement>) {
      if (
        (event.target as HTMLElement).closest(
          'button, a, input, select, textarea, label, summary, [contenteditable], [role="button"], [role="menuitem"]',
        )
      )
        return;
      open();
    },
  };
}
