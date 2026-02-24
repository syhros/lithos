import React, { useState, useMemo } from 'react';
import { X, Check, Code } from 'lucide-react';
import { clsx } from 'clsx';
import { MerchantRule } from '../hooks/useImportRules';
import { TransactionType } from '../data/mockData';
import { CustomSelect, SelectGroup } from './CustomSelect';

// ─────────────────────────────────────────────
// Helpers shared with CreateRulePopup
// ─────────────────────────────────────────────
const TX_TYPE_OPTIONS: SelectGroup[] = [{
  options: [
    { value: 'expense',      label: 'Expense'      },
    { value: 'income',       label: 'Income'       },
    { value: 'transfer',     label: 'Transfer'     },
    { value: 'debt_payment', label: 'Debt Payment' },
    { value: 'investing',    label: 'Investing'    },
  ],
}];

function buildAccountGroups(
  assets: { id: string; name: string }[],
  debts:  { id: string; name: string }[],
  blankLabel: string,
): SelectGroup[] {
  const groups: SelectGroup[] = [{ options: [{ value: '', label: blankLabel }] }];
  if (assets.length > 0) groups.push({ label: 'Assets', options: assets.map(a => ({ value: a.id, label: a.name })) });
  if (debts.length  > 0) groups.push({ label: 'Debts',  options: debts.map(d => ({ value: d.id, label: d.name })) });
  return groups;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
export interface EditRuleModalProps {
  rule:       MerchantRule;
  assets:     { id: string; name: string }[];
  debts:      { id: string; name: string }[];
  categories: string[];
  onSave:     (updated: MerchantRule) => void;
  onDismiss:  () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export const EditRuleModal: React.FC<EditRuleModalProps> = ({
  rule, assets, debts, categories, onSave, onDismiss,
}) => {
  // ─ Match conditions ─
  const [matchDescription, setMatchDescription] = useState(rule.matchDescription);
  const [matchType,        setMatchType]        = useState(rule.matchType);
  const [matchAmount,      setMatchAmount]      = useState(rule.matchAmount);
  const [useRegex,         setUseRegex]         = useState(rule.useRegex || false);

  // ─ Match values ─
  const [contains,          setContains]         = useState(rule.contains);
  const [matchTypeValue,    setMatchTypeValue]   = useState<TransactionType | ''>(rule.matchTypeValue || '');
  const [matchAmountValue,  setMatchAmountValue] = useState<string>(
    rule.matchAmountValue !== '' && rule.matchAmountValue != null
      ? String(rule.matchAmountValue)
      : '',
  );

  // ─ Set actions ─
  const [setDescription, setSetDescription] = useState(rule.setDescription);
  const [setCategory,    setSetCategory]    = useState(rule.setCategory);
  const [setType,        setSetType]        = useState<TransactionType | ''>(rule.setType);
  const [setAccountId,   setSetAccountId]   = useState(rule.setAccountId);
  const [setAccountToId, setSetAccountToId] = useState(rule.setAccountToId);
  const [setNotes,       setSetNotes]       = useState(rule.setNotes);

  const atLeastOneCondition = matchDescription || matchType || matchAmount;

  // Validate regex pattern
  const regexError = useMemo(() => {
    if (!useRegex || !contains) return null;
    try {
      new RegExp(contains, 'i');
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [useRegex, contains]);

  const typeMatchOptions: SelectGroup[] = useMemo(() => [{
    options: [
      { value: '', label: '— select type —' },
      ...TX_TYPE_OPTIONS[0].options,
    ],
  }], []);

  const typeSetOptions: SelectGroup[] = useMemo(() => [{
    options: [
      { value: '', label: '— keep current —' },
      ...TX_TYPE_OPTIONS[0].options,
    ],
  }], []);

  const acctFromGroups = useMemo(() => buildAccountGroups(assets, debts, '— any account —'), [assets, debts]);
  const acctToGroups   = useMemo(() => buildAccountGroups(assets, debts, '— none —'),        [assets, debts]);

  const handleSave = () => {
    onSave({
      ...rule,
      matchDescription,
      matchType,
      matchAmount,
      useRegex,
      contains,
      matchTypeValue,
      matchAmountValue: matchAmountValue !== '' ? parseFloat(matchAmountValue) : '',
      setDescription,
      setCategory,
      setType,
      setAccountId,
      setAccountToId,
      setNotes,
    });
  };

  // Reusable checkbox toggle button
  const CheckToggle: React.FC<{
    label:    string;
    checked:  boolean;
    onChange: (v: boolean) => void;
  }> = ({ label, checked, onChange }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 border rounded-sm text-xs transition-colors',
        checked
          ? 'border-magma/50 bg-magma/10 text-white'
          : 'border-white/10 bg-white/[0.02] text-iron-dust hover:border-white/20',
      )}
    >
      <div className={clsx(
        'w-3.5 h-3.5 border rounded-sm flex items-center justify-center shrink-0',
        checked ? 'border-magma bg-magma' : 'border-white/20',
      )}>
        {checked && <Check size={9} className="text-black" />}
      </div>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 bg-[#131517] border-b border-white/5 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-[2px] text-white">Edit Description Rule</h3>
            <p className="text-[10px] text-iron-dust font-mono mt-0.5 truncate">
              {rule.contains || '(no keyword set)'}
            </p>
          </div>
          <button onClick={onDismiss} className="text-iron-dust hover:text-white shrink-0 mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar">

          {/* ── MATCH CONDITIONS ── */}
          <div>
            <p className="text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Match when… (ALL ticked conditions must pass)</p>
            <div className="flex flex-wrap gap-2">
              <CheckToggle label="Description contains" checked={matchDescription} onChange={setMatchDescription} />
              <CheckToggle label="Type matches"         checked={matchType}        onChange={setMatchType}        />
              <CheckToggle label="Amount matches"       checked={matchAmount}      onChange={setMatchAmount}      />
            </div>
          </div>

          {/* Description contains input with regex toggle */}
          {matchDescription && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">
                  Description contains
                  <span className="text-iron-dust/50 normal-case tracking-normal ml-1">
                    {useRegex ? '(regex pattern)' : '(shorten to a keyword to broaden matching)'}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setUseRegex(!useRegex)}
                  className={clsx(
                    'flex items-center gap-1 px-2 py-1 border rounded-sm text-[9px] transition-colors',
                    useRegex
                      ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                      : 'border-white/10 bg-white/[0.02] text-iron-dust hover:border-white/20',
                  )}
                >
                  <Code size={10} />
                  {useRegex ? 'Regex ON' : 'Regex OFF'}
                </button>
              </div>
              <input
                value={contains}
                onChange={e => setContains(e.target.value)}
                placeholder={useRegex ? 'e.g. ^(PAYBYPHONE|PARKING).*' : 'e.g. PAYBYPHONE'}
                className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white font-mono rounded-sm focus:border-magma outline-none"
              />
              {regexError && (
                <p className="text-[9px] text-red-400 mt-1 font-mono">⚠ Invalid regex: {regexError}</p>
              )}
              {useRegex && !regexError && (
                <p className="text-[9px] text-purple-400/60 mt-1 font-mono">
                  Tip: Use .* for wildcards, ^ for start, $ for end, (A|B) for OR
                </p>
              )}
            </div>
          )}

          {/* Type match value */}
          {matchType && (
            <div>
              <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Type equals</label>
              <CustomSelect
                value={matchTypeValue}
                onChange={v => setMatchTypeValue(v as TransactionType | '')}
                groups={typeMatchOptions}
                placeholder="— select type —"
                triggerClassName="px-3 py-2 text-xs"
                maxVisibleItems={8}
              />
            </div>
          )}

          {/* Amount match value */}
          {matchAmount && (
            <div>
              <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">
                Amount equals (absolute value, e.g. 53.00)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={matchAmountValue}
                onChange={e => setMatchAmountValue(e.target.value)}
                placeholder="e.g. 53.00"
                className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white font-mono rounded-sm focus:border-magma outline-none"
              />
            </div>
          )}

          <hr className="border-white/5" />

          {/* ── SET ACTIONS ── */}
          <div>
            <p className="text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-3">Then set…</p>
            <div className="space-y-3">

              {/* Description + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Description</label>
                  <input
                    value={setDescription}
                    onChange={e => setSetDescription(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Category</label>
                  <input
                    list="edit-rule-cats"
                    value={setCategory}
                    onChange={e => setSetCategory(e.target.value)}
                    placeholder="e.g. Health"
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none"
                  />
                  <datalist id="edit-rule-cats">
                    {categories.map((c, i) => <option key={i} value={c} />)}
                  </datalist>
                </div>
              </div>

              {/* Type + Account From */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Set Type</label>
                  <CustomSelect
                    value={setType}
                    onChange={v => setSetType(v as TransactionType | '')}
                    groups={typeSetOptions}
                    placeholder="— keep current —"
                    triggerClassName="px-3 py-2 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account From</label>
                  <CustomSelect
                    value={setAccountId}
                    onChange={setSetAccountId}
                    groups={acctFromGroups}
                    placeholder="— any account —"
                    triggerClassName="px-3 py-2 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
              </div>

              {/* Account To + Note */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account To (transfers / debt)</label>
                  <CustomSelect
                    value={setAccountToId}
                    onChange={setSetAccountToId}
                    groups={acctToGroups}
                    placeholder="— none —"
                    triggerClassName="px-3 py-2 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Note</label>
                  <input
                    value={setNotes}
                    onChange={e => setSetNotes(e.target.value)}
                    placeholder="e.g. Health plan payment"
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#131517] border-t border-white/5 flex justify-end gap-3">
          <button
            onClick={onDismiss}
            className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!atLeastOneCondition || !!regexError}
            className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 transition-colors"
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
};
