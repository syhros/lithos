// CustomSelect
//
// Portal-rendered dropdown — always floats above overflow:hidden parents.
//
// Behaviour:
//   - Dropdown is appended to <body> via createPortal, positioned with
//     getBoundingClientRect so it never gets clipped.
//   - Auto-flips above the trigger if there isn’t enough space below.
//   - Trigger shows only the plain label (no hint) at a compact size.
//   - Options with value==='' or value==='all' (blank / placeholder rows)
//     render in iron-dust grey so they’re visually distinct.
//   - A group heading is only rendered when SelectGroup.label is set.
//   - hints are still shown inside the dropdown for non-blank options.
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
  triggerClassName?: string;
  error?:            boolean;
  disabled?:         boolean;
  maxVisibleItems?:  number;
}

// Approximate px height of one option row (py-1.5 * 2 + 16px text)
const ROW_H    = 26;
const GROUP_H  = 22;

export const CustomSelect: React.FC<Props> = ({
  value, onChange, groups, placeholder = 'Select…',
  className, triggerClassName, error, disabled, maxVisibleItems = 8,
}) => {
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  const allOptions  = groups.flatMap(g => g.options);
  const selected    = allOptions.find(o => o.value === value);
  const isBlankSel  = !value || value === 'all';

  // —— estimate list height ——
  const estimateH = useCallback(() => {
    let h = 0;
    groups.forEach(g => {
      if (g.label) h += GROUP_H;
      h += g.options.length * ROW_H;
    });
    return Math.min(h, maxVisibleItems * ROW_H + 8);
  }, [groups, maxVisibleItems]);

  // —— position portal ——
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const r        = triggerRef.current.getBoundingClientRect();
    const maxH     = estimateH();
    const below    = window.innerHeight - r.bottom - 8;
    const useAbove = below < maxH && r.top > maxH;
    setDropPos({
      top:   useAbove ? r.top - maxH - 4 : r.bottom + 4,
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

  // re-calc on scroll / resize while open
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
      {/* trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={clsx(
          'w-full flex items-center justify-between bg-black/20 border px-2.5 py-2.5 text-[11px] rounded-sm focus:outline-none transition-colors font-mono text-left',
          error    ? 'border-magma/50' : 'border-white/10',
          open     ? 'border-magma/40' : 'hover:border-white/20',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          triggerClassName,
        )}
      >
        <span className={clsx('truncate font-mono', isBlankSel ? 'text-iron-dust/50' : 'text-white')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={11}
          className={clsx('shrink-0 ml-1 text-iron-dust/50 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* portal dropdown */}
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
                const isSel   = opt.value === value;
                const isBlank = !opt.value || opt.value === 'all';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={() => handleSelect(opt.value)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors font-mono',
                      isSel
                        ? 'bg-magma/10'
                        : isBlank
                          ? 'hover:bg-white/[0.03]'
                          : 'hover:bg-white/[0.04]',
                    )}
                  >
                    <span className={clsx(
                      'font-mono',
                      isSel   ? 'text-magma font-bold'
                      : isBlank ? 'text-iron-dust/50'
                      : 'text-white',
                    )}>
                      {opt.label}
                    </span>
                    {opt.hint && !isBlank && (
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
