// CustomComboBox
//
// A free-text input with a filtered dropdown of suggestions.
// Matches the CustomSelect / SmartSearchBar aesthetic.
// Typing filters the list; selecting inserts the value.
// The user can also type a completely new value not in the list.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  value:        string;
  onChange:     (v: string) => void;
  options:      string[];
  placeholder?: string;
  className?:   string;
  error?:       boolean;
}

export const CustomComboBox: React.FC<Props> = ({
  value, onChange, options, placeholder = 'Type or select...', className, error
}) => {
  const [open,        setOpen]        = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options
    .filter(o => o.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 12);

  useEffect(() => { setHighlighted(0); }, [value]);

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
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelect(filtered[highlighted]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <div className={clsx(
        'flex items-center bg-black/20 border rounded-sm transition-colors',
        error ? 'border-magma/50' : 'border-white/10',
        open  ? 'border-magma/50' : 'hover:border-white/20'
      )}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent p-3 text-sm text-white placeholder-iron-dust/50 outline-none font-mono"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); inputRef.current?.focus(); }}
            className="pr-3 text-iron-dust hover:text-white transition-colors"
          >
            <X size={12} />
          </button>
        ) : (
          <ChevronDown
            size={13}
            className={clsx('mr-3 shrink-0 text-iron-dust transition-transform pointer-events-none', open && 'rotate-180')}
          />
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1c1e] border border-white/10 rounded-sm shadow-2xl z-50 overflow-hidden max-h-52 overflow-y-auto custom-scrollbar">
          <div className="px-3 pt-2 pb-1">
            <p className="text-[9px] font-mono text-iron-dust/60 uppercase tracking-widest">Suggestions · Tab or click</p>
          </div>
          <ul>
            {filtered.map((opt, i) => (
              <li key={opt}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
                  className={clsx(
                    'w-full px-3 py-2 text-xs text-left font-mono transition-colors',
                    i === highlighted ? 'bg-white/[0.06] text-magma' : 'text-white hover:bg-white/[0.03]'
                  )}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
