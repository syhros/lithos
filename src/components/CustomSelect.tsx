// CustomSelect
//
// A fully custom dropdown that matches the search bar aesthetic:
//   - Dark background, orange highlight, mono font
//   - Supports option groups
//   - Each option can have a primary label (orange) and a secondary hint (grey)
//
// Usage:
//   <CustomSelect
//     value={accountId}
//     onChange={setAccountId}
//     placeholder="Select Account..."
//     groups={[
//       {
//         label: 'Assets',
//         options: data.assets.map(a => ({
//           value: a.id,
//           label: a.name,
//           hint: a.type,
//         }))
//       }
//     ]}
//   />
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;   // shown in grey after the label
}

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

interface Props {
  value:        string;
  onChange:     (v: string) => void;
  groups:       SelectGroup[];
  placeholder?: string;
  className?:   string;
  error?:       boolean;
  disabled?:    boolean;
}

export const CustomSelect: React.FC<Props> = ({
  value, onChange, groups, placeholder = 'Select...', className, error, disabled
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allOptions = groups.flatMap(g => g.options);
  const selected   = allOptions.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const humaniseType = (t: string) =>
    t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between bg-black/20 border p-3 text-sm rounded-sm focus:outline-none transition-colors font-mono text-left',
          error    ? 'border-magma/50 focus:border-magma' : 'border-white/10',
          open     ? 'border-magma/50'                    : 'hover:border-white/20',
          disabled ? 'opacity-50 cursor-not-allowed'      : 'cursor-pointer',
          selected ? 'text-white' : 'text-iron-dust/60'
        )}
      >
        <span className="truncate flex items-center gap-2">
          {selected ? (
            <>
              <span className="text-magma font-bold">{selected.label}</span>
              {selected.hint && (
                <span className="text-iron-dust/60 text-[10px] font-mono">
                  {humaniseType(selected.hint)}
                </span>
              )}
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={clsx('shrink-0 text-iron-dust transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1c1e] border border-white/10 rounded-sm shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          {placeholder && (
            <button
              type="button"
              onMouseDown={() => handleSelect('')}
              className="w-full flex items-center px-3 py-2 text-xs text-iron-dust/40 hover:bg-white/[0.03] text-left font-mono italic"
            >
              {placeholder}
            </button>
          )}
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-3 pt-2 pb-1 text-[9px] font-mono text-iron-dust/50 uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              {group.options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={() => handleSelect(opt.value)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors',
                    opt.value === value
                      ? 'bg-magma/10 text-magma'
                      : 'hover:bg-white/[0.04] text-white'
                  )}
                >
                  <span className={clsx('font-mono font-bold', opt.value === value ? 'text-magma' : 'text-magma')}>
                    {opt.label}
                  </span>
                  {opt.hint && (
                    <span className="text-iron-dust/50 text-[10px] font-mono">
                      {humaniseType(opt.hint)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
