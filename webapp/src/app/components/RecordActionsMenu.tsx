import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface MenuOption {
  label: string;
  icon: ComponentType<{ size?: number }>;
  disabled?: boolean;
  run: () => unknown;
}

interface RecordActionsMenuProps {
  name: string;
  entityLabel: string;
  options: MenuOption[];
  header?: ReactNode;
  busy?: boolean;
}

/** A shared menu rendered outside tables to avoid clipping in scroll containers. */
export default function RecordActionsMenu({
  name,
  entityLabel,
  options,
  header,
  busy,
}: RecordActionsMenuProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = (restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const dismiss = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setPosition(null);
    };
    const onScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const onResize = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [position]);
  function toggle() {
    if (position) return close();
    const rect = trigger.current!.getBoundingClientRect();
    const height = options.length * 36 + (header ? 52 : 12);
    setPosition({
      left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)),
      top:
        rect.bottom + height + 8 <= window.innerHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - height - 4),
    });
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % buttons.length
        : event.key === 'ArrowUp'
          ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1;
    if (next >= 0) {
      event.preventDefault();
      buttons[next]?.focus();
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button store-menu-trigger"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-controls={position ? menuId : undefined}
        onClick={toggle}
        disabled={busy || !options.length}
      >
        <MoreHorizontal size={20} />
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={`${entityLabel} actions for ${name}`}
            className="store-actions-menu"
            style={position}
            onKeyDown={navigate}
          >
            {header && <div className="store-menu-code">{header}</div>}
            {options.map(({ label, icon: Icon, disabled, run }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={busy || disabled}
                onClick={() => {
                  close();
                  run();
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
