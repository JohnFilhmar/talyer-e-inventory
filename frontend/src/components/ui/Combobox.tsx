'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * One selectable row. `label` is what the user types against and reads;
 * `value` is what the caller stores (an id, in every current use).
 */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional heading this option is filed under, e.g. a motorcycle make. */
  group?: string;
  /** Secondary line, e.g. a SKU or a product count. */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  /** Selected value, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Text for the row that clears the selection. Omit to make the field required. */
  emptyOptionLabel?: string;
  disabled?: boolean;
  isLoading?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  id?: string;
}

/**
 * Type-ahead select.
 *
 * A native `<select>` is unusable past a few dozen rows — there is nowhere to
 * type, so finding "Honda Click 125i" among hundreds of motorcycles means
 * scrolling a list the browser renders as one flat column. This is the same
 * control shape a `<datalist>` gives, implemented rather than delegated for
 * three reasons a datalist cannot cover: the stored value is an id while the
 * displayed text is a label, options are grouped under headings, and Safari and
 * Firefox render datalists inconsistently on mobile — which is the platform the
 * counter actually runs on.
 *
 * Filtering is client-side over `options`, which suits data already held in
 * full (categories, motorcycle models) and mirrored offline. A list large
 * enough to need server-side search would want a different component.
 *
 * No transitions or animation, per the project's design rules.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Search...',
  emptyOptionLabel,
  disabled = false,
  isLoading = false,
  error,
  helperText,
  className = '',
  id,
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  /**
   * While closed the input shows the current selection; while open it shows
   * what the user is typing. Without this split, opening the menu would leave
   * the selected label sitting in the box as a filter, so the first keystroke
   * would search inside it and appear to match nothing.
   */
  const inputValue = isOpen ? query : (selected?.label ?? '');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!isOpen || term === '') return options;

    // Substring rather than prefix: users search for "Click" in "Honda Click
    // 125i" far more often than they type the make first.
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.group?.toLowerCase().includes(term) ||
        option.hint?.toLowerCase().includes(term)
    );
  }, [options, query, isOpen]);

  /**
   * The clear row is prepended as a real option so keyboard navigation treats
   * it like any other row rather than needing a special case at index -1.
   */
  const rows = useMemo<ComboboxOption[]>(() => {
    if (!emptyOptionLabel) return filtered;
    if (query.trim() !== '') return filtered;
    return [{ value: '', label: emptyOptionLabel }, ...filtered];
  }, [filtered, emptyOptionLabel, query]);

  /**
   * Typing shrinks the result set, which can leave the stored highlight past
   * the end of the list. Clamped here on read rather than corrected in an
   * effect: an effect would re-render a second time to fix a value this render
   * already knows, and the project's lint rules reject setState inside one.
   */
  const clampedIndex = rows.length === 0 ? 0 : Math.min(activeIndex, rows.length - 1);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const open = useCallback(() => {
    if (disabled || isLoading) return;
    setIsOpen(true);
    setQuery('');
    // Start on the current selection so Enter re-picks it rather than jumping
    // to whatever happens to be first.
    const index = rows.findIndex((row) => row.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [disabled, isLoading, rows, value]);

  const commit = useCallback(
    (option: ComboboxOption) => {
      onChange(option.value);
      close();
      inputRef.current?.blur();
    },
    [onChange, close]
  );

  // Close on an outside click. Pointerdown rather than click so the menu closes
  // before a click on something behind it lands.
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, close]);

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex, isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      open();
      return;
    }

    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((clampedIndex + 1) % Math.max(rows.length, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((clampedIndex - 1 + rows.length) % Math.max(rows.length, 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = rows[clampedIndex];
        if (option) commit(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        close();
        inputRef.current?.blur();
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  // Group headings are rendered by comparing each row to the one before it,
  // which keeps `rows` a flat array for keyboard navigation while still showing
  // headings. Options must therefore arrive already sorted by group.
  const previousGroupOf = (index: number) => (index > 0 ? rows[index - 1].group : undefined);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
        </label>
      )}

      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen ? `${inputId}-option-${clampedIndex}` : undefined}
          autoComplete="off"
          value={isLoading ? '' : inputValue}
          placeholder={isLoading ? 'Loading...' : placeholder}
          disabled={disabled || isLoading}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={open}
          onKeyDown={handleKeyDown}
          className="w-full pl-3 pr-16 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:opacity-50"
        />

        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
          {selected && !disabled && !isLoading && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                close();
              }}
              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              aria-label={`Clear ${label ?? 'selection'}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => (isOpen ? close() : inputRef.current?.focus())}
            disabled={disabled || isLoading}
            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
            aria-label={isOpen ? 'Close options' : 'Open options'}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {isOpen && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="absolute z-20 w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg"
          >
            {rows.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                No matches
              </li>
            )}

            {rows.map((option, index) => {
              const isActive = index === clampedIndex;
              const isSelected = option.value === value && option.value !== '';
              const showGroup = !!option.group && option.group !== previousGroupOf(index);

              return (
                <React.Fragment key={`${option.value || 'none'}-${index}`}>
                  {showGroup && (
                    <li
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                    >
                      {option.group}
                    </li>
                  )}
                  <li
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    // Mousedown, not click: the input's blur would otherwise
                    // close the menu before the click landed.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${
                      isActive
                        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-gray-900 dark:text-gray-100'
                        : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                          {option.hint}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="w-4 h-4 shrink-0 text-yellow-600" />}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        )}
      </div>

      {helperText && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default Combobox;
