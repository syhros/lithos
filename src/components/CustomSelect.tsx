// CustomSelect
//
// Portal-rendered dropdown — always floats above overflow:hidden parents.
//
// Props:
//   size  'sm' | 'md' | 'lg'
//         sm  — px-2.5 py-1.5  text-[11px]  (inline / table cells, Categorize rows)
//         md  — px-3   py-2.5  text-sm       (modal form fields, matches native p-3 inputs)
//         lg  — px-3   py-3    text-sm       (full-width Settings-style selects)
//   triggerClassName — extra classes merged onto the trigger button
//
// Behaviour:
//   - Dropdown rendered via createPortal onto <body>; never clipped.
//   - Auto-flips above trigger when insufficient space below.
//   - Blank-value options (value === '' | 'all') rendered in iron-dust grey.
//   - Real selections shown in magma orange in the trigger.
//   - Group heading only rendered when SelectGroup.label is set.
//   - hints shown inside the dropdown only (not in trigger).
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

type SelectSize = 'sm' | 'md' | 'lg';

interface Props {
  value:             string;
  onChange:          (v: string) => void;
  groups:            SelectGroup[];
  placeholder?:      string;
  size?:             SelectSize;
  className?:        string;
  triggerClassName?: string;
  error?:            boolean;
  disabled?:         boolean;
  maxVisibleItems?:  number;
}

// row height used to estimate list pixel height before it renders
const ROW_H   = 28;
const GROUP_H = 22;

const SIZES: Record<SelectSize, string> = {
  sm: 'px-2.5 py-1.5 text-[11px]',
  md: 'px-3   py-2.5 text-sm',
  lg: 'px-3   py-3   text-sm',
};

export const CustomSelect: React.FC<Props> = ({
  value, onChange, groups, placeholder = 'Select…',
  size = 'sm', className, triggerClassName,
  error, disabled, maxVisibleItems = 8,
}) => {
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  const allOptions = groups.flatMap(g => g.options);
  const selected   = allOptions.find(o => o.value === value);
  // blank = placeholder-style value (no real selection)
  const isBlank    = !value || value === 'all';

  // estimate dropdown pixel height
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

  // close on outside click
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

  // re-position on scroll / resize
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
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={clsx(
          'w-full flex items-center justify-between bg-black/20 border rounded-sm focus:outline-none transition-colors font-mono text-left',
          SIZES[size],
          error    ? 'border-magma/50' : 'border-white/10',
          open     ? 'border-magma/40' : 'hover:border-white/20',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          triggerClassName,
        )}
      >
        <span className={clsx(
          'truncate font-mono',
          isBlank ? 'text-iron-dust/50' : 'text-magma font-bold',
        )}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={size === 'sm' ? 11 : 13}
          className={clsx('shrink-0 ml-1 text-iron-dust/50 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* ── Portal dropdown ── */}
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
                      'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors font-mono',
                      isSel      ? 'bg-magma/10'
                      : isBlankOpt ? 'hover:bg-white/[0.03]'
                      :              'hover:bg-white/[0.04]',
                    )}
                  >
                    <span className={clsx(
                      'font-mono',
                      isSel      ? 'text-magma font-bold'
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
