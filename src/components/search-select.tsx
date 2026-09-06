'use client';

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X, SearchX } from 'lucide-react';
import { normalizeSearch } from '@/lib/search';

type Option = { value: string; label: string; disabled: boolean };
type Props = {
  children: ReactNode;
  value?: string | number;
  onChange: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '';
    })
    .join('');
}
function optionsOf(children: ReactNode): Option[] {
  const result: Option[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)
    )
      return;
    if (child.type === 'option')
      result.push({
        value: String(child.props.value ?? textOf(child.props.children)),
        label: textOf(child.props.children).trim(),
        disabled: !!child.props.disabled,
      });
    else if (child.props.children) result.push(...optionsOf(child.props.children));
  });
  return result;
}

/** Single-select combobox with a searchable, portalled list and native form validation. */
export function SearchSelect(props: Props) {
  const {
    children,
    value = '',
    onChange,
    className = '',
    disabled = false,
    required = false,
  } = props;
  const uid = useId().replace(/:/g, '');
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [inferredLabel, setInferredLabel] = useState('انتخاب گزینه');
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 280,
    maxHeight: 350,
    direction: 'below',
  });
  const options = useMemo(() => optionsOf(children), [children]);
  const selected = options.find((option) => option.value === String(value));
  const label = props['aria-label'] || inferredLabel;
  const filtered = options.filter(
    (option) =>
      (!required || option.value !== '') &&
      normalizeSearch(`${option.label} ${option.value}`).includes(normalizeSearch(query)),
  );
  const selectedText =
    selected?.label || (value ? 'گزینهٔ انتخاب‌شده در دسترس نیست' : 'انتخاب کنید');
  useLayoutEffect(() => {
    const labelElement = trigger.current?.closest('label');
    const text = labelElement
      ?.querySelector(':scope > span')
      ?.textContent?.replace(/\*/g, '')
      .trim();
    if (text) setInferredLabel(text);
  }, []);
  const close = useCallback((restore = false) => {
    setOpen(false);
    setQuery('');
    if (restore) trigger.current?.focus({ preventScroll: true });
  }, []);
  const measure = useCallback(() => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const start = viewport?.offsetTop || 0;
    const width = Math.min(Math.max(rect.width, 270), window.innerWidth - 24);
    const below = start + height - rect.bottom - 12;
    const above = rect.top - start - 12;
    const upwards = below < 240 && above > below;
    const maxHeight = Math.max(120, Math.min(350, upwards ? above : below));
    setPosition({
      top: upwards ? rect.top - maxHeight - 7 : rect.bottom + 7,
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      width,
      maxHeight,
      direction: upwards ? 'above' : 'below',
    });
  }, []);
  const show = (initialQuery = '') => {
    if (disabled) return;
    document.dispatchEvent(new CustomEvent('taraz:select-open', { detail: uid }));
    setQuery(initialQuery);
    const available = options.filter((option) => !required || option.value !== '');
    setCursor(
      Math.max(
        0,
        available.findIndex((option) => option.value === String(value) && !option.disabled),
      ),
    );
    measure();
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    input.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close();
    };
    const resize = new ResizeObserver(measure);
    if (trigger.current) resize.observe(trigger.current);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [open, close, measure]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-option-index="${cursor}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);
  useEffect(() => {
    if (value) setInvalid(false);
  }, [value]);
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  useEffect(() => {
    const otherOpened = (event: Event) => {
      if ((event as CustomEvent).detail !== uid) close();
    };
    document.addEventListener('taraz:select-open', otherOpened);
    return () => document.removeEventListener('taraz:select-open', otherOpened);
  }, [uid, close]);
  const choose = (option: Option) => {
    if (option.disabled) return;
    onChange({ target: { value: option.value }, currentTarget: { value: option.value } });
    setInvalid(false);
    close(true);
  };
  const handleKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close(true);
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[cursor]) choose(filtered[cursor]);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const enabled = filtered
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !option.disabled)
        .map(({ index }) => index);
      const current = enabled.indexOf(cursor);
      setCursor(
        event.key === 'Home'
          ? enabled[0] || 0
          : event.key === 'End'
            ? enabled.at(-1) || 0
            : enabled[
                (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
              ] || 0,
      );
    }
  };
  return (
    <span
      className={`search-select ${className} ${open ? 'select-open' : ''} ${invalid || props['aria-invalid'] ? 'select-invalid' : ''}`}
      data-value={String(value)}
    >
      <button
        ref={trigger}
        id={props.id}
        type="button"
        className="search-select-trigger"
        role="combobox"
        title={selectedText}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-haspopup="listbox"
        aria-required={required || undefined}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        aria-describedby={props['aria-describedby']}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            show();
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.key !== ' '
          ) {
            event.preventDefault();
            show(event.key);
          }
        }}
      >
        <span className={`select-value ${!value ? 'select-placeholder' : ''}`}>{selectedText}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {required && !disabled && (
        <input
          className="select-validation"
          aria-hidden="true"
          tabIndex={-1}
          value={selected?.value || ''}
          onChange={() => {}}
          required
          name={props.name}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            if (event.currentTarget.form?.querySelector(':invalid') === event.currentTarget) {
              trigger.current?.focus();
              show();
            }
          }}
        />
      )}
      {open &&
        createPortal(
          <div
            ref={popup}
            className="search-select-popup"
            dir="rtl"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              height: position.direction === 'above' ? position.maxHeight : undefined,
              maxHeight: position.maxHeight,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="select-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={input}
                role="combobox"
                aria-label={`جست‌وجو در ${label}`}
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={filtered[cursor] ? `${uid}-option-${cursor}` : undefined}
                placeholder="جست‌وجوی نام یا کد…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={handleKeys}
              />
              {query && (
                <button
                  type="button"
                  aria-label="پاک کردن جست‌وجوی گزینه‌ها"
                  onClick={() => {
                    setQuery('');
                    setCursor(0);
                    input.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div
              role="listbox"
              id={`${uid}-list`}
              aria-label={`گزینه‌های ${label}`}
              className="select-options"
            >
              {filtered.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  tabIndex={-1}
                  id={`${uid}-option-${index}`}
                  role="option"
                  aria-selected={option.value === String(value)}
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  data-value={option.value}
                  data-option-index={index}
                  className={`select-option ${cursor === index ? 'option-focused' : ''}`}
                  onPointerMove={() => {
                    if (!option.disabled) setCursor(index);
                  }}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {option.value === String(value) && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
            {!filtered.length && (
              <div className="select-empty" role="status">
                <SearchX size={24} />
                <strong>گزینه‌ای پیدا نشد</strong>
                <span>نام یا کد دیگری را امتحان کنید.</span>
              </div>
            )}
            <div className="select-footer">
              <span>{new Intl.NumberFormat('fa-IR').format(filtered.length)} گزینه</span>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> انتخاب <kbd>Enter</kbd> تأیید
              </span>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
