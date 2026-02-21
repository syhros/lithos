// SmartSearchBar
//
// Search input with live autocomplete.
//
// Multi-value OR  -> commas:  account:Halifax,Natwest
// AND operator    -> #  (next token must also match)
// EXCLUDE         -> /  (next token must not match)
//
// Tab / click inserts field: with NO trailing space so the value dropdown
// appears immediately. Values are inserted without quotes.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';

const FIELD_PREFIXES = [
  { label: 'account:',  hint: 'account:Halifax,Natwest  — comma = OR' },
  { label: 'type:',     hint: 'type:expense,income' },
  { label: 'category:', hint: 'category:groceries,shopping' },
  { label: 'amount:',   hint: 'amount:12.50' },
];

const OPERATORS = [
  { label: '#', hint: 'AND – next token must also match' },
  { label: '/', hint: 'EXCLUDE – next token must not match' },
];

const TYPE_VALUES = ['income', 'expense', 'investing', 'transfer', 'debt_payment'];

interface Suggestion {
  insert: string;
  label:  string;
  hint?:  string;
  kind:   'field' | 'value' | 'operator' | 'account';
  // When true, insertion does NOT append a trailing space
  // (used for field: so the value dropdown opens immediately)
  noTrailingSpace?: boolean;
}

interface Props {
  value:        string;
  onChange:     (v: string) => void;
  accounts:     { id: string; name: string }[];
  categories:   string[];
  placeholder?: string;
}

// Detect if cursor is inside a field:value,... context (handles quoted segments too)
function parseCommaContext(beforeCursor: string) {
  const re = /(?:^|\s)(account|type|category):((?:(?:"[^"]*"|[^\s,"])+,)*)([^\s,"]*)$/i;
  const m = re.exec(beforeCursor);
  if (!m) return null;
  return { field: m[1].toLowerCase(), prefix: m[2], partial: m[3].toLowerCase() };
}

export const SmartSearchBar: React.FC<Props> = ({
  value, onChange, accounts, categories,
  placeholder = 'Search…  account:Halifax,Natwest  type:expense  # /'
}) => {
  const [open,        setOpen]        = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const buildSuggestions = useCallback((raw: string): Suggestion[] => {
    const suggs: Suggestion[] = [];
    const cursorPos    = inputRef.current?.selectionStart ?? raw.length;
    const beforeCursor = raw.slice(0, cursorPos);
    const wordStart    = beforeCursor.lastIndexOf(' ') + 1;
    const currentWord  = beforeCursor.slice(wordStart).toLowerCase();
    if (!currentWord) return [];

    // Operators
    OPERATORS.forEach(op => {
      if (op.label === currentWord)
        suggs.push({ insert: op.label, label: op.label, hint: op.hint, kind: 'operator' });
    });

    // Check if cursor is inside a field:value,... context
    const ctx = parseCommaContext(beforeCursor);
    if (ctx) {
      const { field, prefix, partial } = ctx;
      if (field === 'account') {
        accounts
          .filter(a => a.name.toLowerCase().includes(partial))
          .slice(0, 8)
          .forEach(a => suggs.push({
            // No quotes — names inserted plain, normaliser handles spaces
            insert: `account:${prefix}${a.name}`,
            label:  a.name,
            hint:   prefix ? '+ add to list' : undefined,
            kind:   'account',
          }));
      } else if (field === 'type') {
        TYPE_VALUES
          .filter(t => t.includes(partial))
          .forEach(t => suggs.push({ insert: `type:${prefix}${t}`, label: t, kind: 'value' }));
      } else if (field === 'category') {
        categories
          .filter(c => c.toLowerCase().includes(partial))
          .slice(0, 8)
          .forEach(c => suggs.push({ insert: `category:${prefix}${c}`, label: c, kind: 'value' }));
      }
    } else {
      // Field prefix suggestions — NO trailing space so value autocomplete fires immediately
      FIELD_PREFIXES.forEach(fp => {
        if (fp.label.startsWith(currentWord) && currentWord !== fp.label)
          suggs.push({ insert: fp.label, label: fp.label, hint: fp.hint, kind: 'field', noTrailingSpace: true });
      });
    }

    return suggs;
  }, [accounts, categories]);

  useEffect(() => {
    const s = buildSuggestions(value);
    setSuggestions(s);
    setHighlighted(0);
    setOpen(s.length > 0);
  }, [value, buildSuggestions]);

  const insertSuggestion = (sugg: Suggestion) => {
    const cursorPos    = inputRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursorPos);
    const afterCursor  = value.slice(cursorPos);
    const wordStart    = beforeCursor.lastIndexOf(' ') + 1;
    const trail = sugg.noTrailingSpace ? '' : ' ';
    const newVal = value.slice(0, wordStart) + sugg.insert + trail + afterCursor.trimStart();
    // For field: insertions keep the cursor right after the colon (no extra space)
    onChange(sugg.noTrailingSpace ? newVal : newVal.trimEnd() + ' ');
    setOpen(false);
    // Re-open suggestions immediately after field: insertion
    setTimeout(() => {
      inputRef.current?.focus();
      if (sugg.noTrailingSpace) {
        const s = buildSuggestions(newVal);
        setSuggestions(s);
        setOpen(s.length > 0);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertSuggestion(suggestions[highlighted]); }
    if (e.key === 'Escape') setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const kindColour: Record<string, string> = {
    field:    'text-magma',
    operator: 'text-purple-400',
    account:  'text-blue-400',
    value:    'text-emerald-400',
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[200px] max-w-2xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-iron-dust w-4 h-4 pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { const s = buildSuggestions(value); setSuggestions(s); setOpen(s.length > 0); }}
        className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 pl-10 pr-8 text-xs text-white placeholder-iron-dust/50 focus:outline-none focus:border-magma/50 transition-colors font-mono"
      />
      {value && (
        <button
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-iron-dust hover:text-white transition-colors">
          <X size={13} />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1c1e] border border-white/10 rounded-sm shadow-2xl z-50 overflow-hidden">
          <div className="px-3 pt-2 pb-1">
            <p className="text-[9px] font-mono text-iron-dust/60 uppercase tracking-widest">Suggestions · Tab or click to insert</p>
          </div>
          <ul>
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  onMouseDown={e => { e.preventDefault(); insertSuggestion(s); }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors',
                    i === highlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  )}>
                  <span className={clsx('font-mono font-bold shrink-0', kindColour[s.kind])}>{s.label}</span>
                  {s.hint && <span className="text-iron-dust/60 text-[10px]">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
