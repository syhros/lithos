// CustomSelect
//
// A fixed-option dropdown visually identical to CustomComboBox.
//
// Padding / font-size live ONLY in triggerClassName so they can be
// overridden per call-site without Tailwind class conflicts:
//
//   Default (modal / full-width fields):  p-3 text-sm        ← matches native inputs
//   Compact (table rows, Categorize):     px-2 py-2 text-xs  ← matches neighbouring inputs
//
// Usage:
//   <CustomSelect ... />                              // default p-3 text-sm
//   <CustomSelect ... triggerClassName="px-2 py-2 text-xs" />  // compact
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

interface Props {
  value:             string;
  onChange:          (v: string) => void;
  groups:            SelectGroup[];
  placeholder?:      string;
  className?:        string;
  /** Override padding + font-size to match neighbouring inputs.
   *  Defaults to "p-3 text-sm" (same as CustomComboBox / native inputs).
   *  Pass e.g. "px-2 py-2 text-xs" for compact table-row contexts. */
  triggerClassName?: string;
  error?:            boolean;
  disabled?:         boolean;
  maxVisibleItems?:  number;
}

const ROW_H   = 30;
const GROUP_H = 22;

export const CustomSelect: React.FC<Props> = ({
  value, onChange, groups, placeholder = 'Select…',
  className, triggerClassName, error, disabled, maxVisibleItems = 8,
}) => {
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  const allOptions = groups.flatMap(g => g.options);
  const selected   = allOptions.find(o => o.value === value);
  const isBlank    = !value || value === 'all';

  const estimateH = useCallback(() => {
    let h = 0;
    groups.forEach(g => {
      if (g.label) h += GROUP_H;
      h += g.options.length * ROW_H;
    });
    return Math.min(h, maxVisibleItems * ROW_H + 8);
  }, [groups, maxVisibleItems]);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r    = triggerRef.current.getBoundingClientRect();
    const maxH = estimateH();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const above = spaceBelow < maxH && r.top > maxH;
    setDropPos({
      top:   above ? r.top - maxH - 4 : r.bottom + 4,
      left:  r.left,
      width: r.width,
    });
  }, [estimateH]);

  const openDropdown = () => {
    if (disabled) return;
    calcPos();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropRef.current    && !dropRef.current.contains(t)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const u = () => calcPos();
    window.addEventListener('scroll', u, true);
    window.addEventListener('resize', u);
    return () => {
      window.removeEventListener('scroll', u, true);
      window.removeEventListener('resize', u);
    };
  }, [open, calcPos]);

  const handleSelect = (v: string) => { onChange(v); setOpen(false); };

  const listMaxH = estimateH();

  return (
    <div className={clsx('relative', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={clsx(
          // layout / chrome — never overridden
          'w-full flex items-center justify-between bg-black/20 border rounded-sm transition-colors focus:outline-none font-mono text-left',
          // border state
          error    ? 'border-magma/50' : 'border-white/10',
          open     ? 'border-magma/50' : 'hover:border-white/20',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          // padding + font-size — caller overrides via triggerClassName
          triggerClassName ?? 'p-3 text-sm',
        )}
      >
        <span className={clsx(
          'truncate font-mono',
          isBlank ? 'text-iron-dust/50' : 'text-white',
        )}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={clsx('shrink-0 ml-2 text-iron-dust transition-transform pointer-events-none', open && 'rotate-180')}
        />
      </button>

      {/* Portal dropdown */}
      {open && dropPos && createPortal(
        <div
          ref={dropRef}
          style={{
            position:  'fixed',
            top:       dropPos.top,
            left:      dropPos.left,
            width:     dropPos.width,
            maxHeight: listMaxH,
            zIndex:    9999,
          }}
          className="bg-[#1a1c1e] border border-white/10 rounded-sm shadow-2xl overflow-y-auto custom-scrollbar"
        >
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-3 pt-2 pb-0.5 text-[9px] font-mono text-iron-dust/50 uppercase tracking-widest select-none">
                  {group.label}
                </p>
              )}
              {group.options.map(opt => {
                const isSel      = opt.value === value;
                const isBlankOpt = !opt.value || opt.value === 'all';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={() => handleSelect(opt.value)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors font-mono',
                      isSel        ? 'bg-white/[0.06] text-magma'
                      : isBlankOpt ? 'text-iron-dust/50 hover:bg-white/[0.03]'
                      :              'text-white hover:bg-white/[0.03]',
                    )}
                  >
                    <span className={clsx(
                      'font-mono',
                      isSel        ? 'text-magma'
                      : isBlankOpt ? 'text-iron-dust/50'
                      :              'text-white',
                    )}>
                      {opt.label}
                    </span>
                    {opt.hint && !isBlankOpt && (
                      <span className="text-iron-dust/40 text-[10px] font-mono">{opt.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};
