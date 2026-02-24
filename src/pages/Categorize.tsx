import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload, Plus, Trash2, Save, ChevronDown, ChevronUp,
  ArrowRight, Tag, Shuffle, RefreshCcw, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, X, Check, Filter, Link2, Loader2, Columns2, Pencil, Download, AlertTriangle, Code
} from 'lucide-react';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { TransactionType } from '../data/mockData';
import {
  useImportRules,
  TypeMappingRule,
  MerchantRule,
  TransferRule,
  applyMerchantRules,
  BLANK_MERCHANT_RULE,
} from '../hooks/useImportRules';
import { CustomSelect, SelectGroup } from '../components/CustomSelect';
import { EditRuleModal } from '../components/EditRuleModal';
import { supabase } from '../lib/supabase';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
type BankType = 'natwest' | 'halifax' | 'generic';

interface RawRow {
  id: string;
  rawDate: string;
  rawType: string;
  rawDescription: string;
  rawAmount: number;
  balance?: number;
  bankType: BankType;
  resolvedType: TransactionType;
  resolvedDescription: string;
  resolvedCategory: string;
  resolvedAccountId: string;
  resolvedAccountToId: string;
  resolvedNotes: string;
  matchedPairId?: string;
  isTransfer: boolean;
  /** Credit-side of a matched transfer pair — will be skipped on import */
  isTransferCredit: boolean;
  skip: boolean;
  sourceCsvName: string;
  rawAccountName?: string;
  accountMatchWarning?: string;
}

export interface CsvConfig {
  csvName: string;
  accountId: string;
  accountColumnName: string;
  amountColumns: 1 | 2;
  amountCol: string;
  debitCol: string;
  creditCol: string;
  headers: string[];
}

const TX_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'debt_payment', 'investing'];

const TX_TYPE_OPTIONS: SelectGroup[] = [{
  options: [
    { value: 'expense',      label: 'Expense' },
    { value: 'income',       label: 'Income' },
    { value: 'transfer',     label: 'Transfer' },
    { value: 'debt_payment', label: 'Debt Payment' },
    { value: 'investing',    label: 'Investing' },
  ],
}];

function buildAccountGroups(
  assets: { id: string; name: string }[],
  debts: { id: string; name: string }[],
  blankLabel: string,
): SelectGroup[] {
  const groups: SelectGroup[] = [{ options: [{ value: '', label: blankLabel }] }];
  if (assets.length > 0) groups.push({ label: 'Assets', options: assets.map(a => ({ value: a.id, label: a.name })) });
  if (debts.length  > 0) groups.push({ label: 'Debts',  options: debts.map(d => ({ value: d.id, label: d.name })) });
  return groups;
}

// ────────────────────────────────────────────────
// CSV Parse helpers
// ────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectBankType(headers: string[]): BankType {
  const h = headers.map(x => x.toLowerCase());
  if (h.includes('account name')) return 'natwest';
  if (h.includes('sort code'))    return 'halifax';
  return 'generic';
}

function parseNatwestDate(raw: string): string {
  const months: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
  };
  const parts = raw.trim().split(' ');
  if (parts.length === 3) {
    const m = months[parts[1].toLowerCase()] || '01';
    return `${parts[2]}-${m}-${parts[0].padStart(2,'0')}`;
  }
  return raw;
}

function parseHalifaxDate(raw: string): string {
  const parts = raw.trim().split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return raw;
}

function parseAccountName(rawAccountName: string): {
  baseName: string;
  accountType: 'account' | 'debt' | 'savings'
} {
  const trimmed = rawAccountName.trim();
  if (trimmed.includes('#Debt')) {
    return { baseName: trimmed.replace('#Debt', '').trim(), accountType: 'debt' };
  }
  if (trimmed.includes('#Savings')) {
    return { baseName: trimmed.replace('#Savings', '').trim(), accountType: 'savings' };
  }
  return { baseName: trimmed, accountType: 'account' };
}

function findAccountIdByName(
  baseName: string,
  accountType: 'account' | 'debt' | 'savings',
  assets: { id: string; name: string }[],
  debts: { id: string; name: string }[],
): { id: string; warning?: string } {
  const lowerName = baseName.toLowerCase();
  if (accountType === 'debt') {
    const debt = debts.find(d => d.name.toLowerCase() === lowerName);
    if (!debt) return { id: '', warning: `Debt account "${baseName}" not found. Create it or use "${baseName}#Debt" in CSV.` };
    return { id: debt.id };
  } else {
    const asset = assets.find(a => a.name.toLowerCase() === lowerName);
    if (!asset) return { id: '', warning: `Account "${baseName}" not found. Create it first or check the name matches exactly.` };
    return { id: asset.id };
  }
}

function assignAccountByDirection(
  rawAmount: number,
  accountId: string,
  rawAccountName: string | undefined,
  assets: { id: string; name: string }[],
  debts: { id: string; name: string }[],
): {
  resolvedAccountId: string;
  resolvedAccountToId: string;
  accountMatchWarning?: string;
} {
  if (rawAccountName) {
    const { baseName, accountType } = parseAccountName(rawAccountName);
    const { id: foundAccountId, warning } = findAccountIdByName(baseName, accountType, assets, debts);
    if (foundAccountId) {
      if (rawAmount >= 0) return { resolvedAccountId: '', resolvedAccountToId: foundAccountId };
      else return { resolvedAccountId: foundAccountId, resolvedAccountToId: '' };
    } else {
      return { resolvedAccountId: '', resolvedAccountToId: '', accountMatchWarning: warning };
    }
  }
  if (!accountId) return { resolvedAccountId: '', resolvedAccountToId: '' };
  if (rawAmount >= 0) return { resolvedAccountId: '', resolvedAccountToId: accountId };
  else return { resolvedAccountId: accountId, resolvedAccountToId: '' };
}

function parseCSV(
  text: string,
  fileName: string,
  typeRules: TypeMappingRule[],
  csvConfig: CsvConfig | null,
  assets: { id: string; name: string }[],
  debts: { id: string; name: string }[],
): RawRow[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/'/g,'').trim());
  const bankType = detectBankType(headers);
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.every(c => !c)) continue;
    const get = (name: string) => {
      const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      return idx >= 0 ? (cells[idx] || '').trim() : '';
    };

    let rawDate = '', rawType = '', rawDescription = '', rawAmount = 0, balance: number | undefined;
    let rawAccountName: string | undefined;

    if (csvConfig?.accountColumnName) {
      rawAccountName = get(csvConfig.accountColumnName);
    }

    if (csvConfig && csvConfig.amountColumns === 2 && csvConfig.debitCol && csvConfig.creditCol) {
      rawDate        = get('date') || get('Date') || get('Transaction Date');
      rawType        = get('type') || get('Type') || get('Transaction Type');
      rawDescription = get('description') || get('Description') || get('Transaction Description');
      if (bankType === 'natwest') rawDate = parseNatwestDate(rawDate);
      if (bankType === 'halifax') rawDate = parseHalifaxDate(rawDate);
      const debit  = parseFloat(get(csvConfig.debitCol))  || 0;
      const credit = parseFloat(get(csvConfig.creditCol)) || 0;
      rawAmount = credit > 0 ? credit : -debit;
    } else if (csvConfig && csvConfig.amountColumns === 1 && csvConfig.amountCol) {
      rawDate        = get('date') || get('Date') || get('Transaction Date');
      rawType        = get('type') || get('Type') || get('Transaction Type');
      rawDescription = get('description') || get('Description') || get('Transaction Description');
      if (bankType === 'natwest') rawDate = parseNatwestDate(rawDate);
      if (bankType === 'halifax') rawDate = parseHalifaxDate(rawDate);
      rawAmount = parseFloat(get(csvConfig.amountCol)) || 0;
    } else if (bankType === 'natwest') {
      rawDate        = parseNatwestDate(get('Date'));
      rawType        = get('Type');
      rawDescription = get('Description');
      const val      = parseFloat(get('Value'));   rawAmount = isNaN(val) ? 0 : val;
      const bal      = parseFloat(get('Balance')); balance   = isNaN(bal) ? undefined : bal;
    } else if (bankType === 'halifax') {
      rawDate        = parseHalifaxDate(get('Transaction Date'));
      rawType        = get('Transaction Type');
      rawDescription = get('Transaction Description');
      const debit    = parseFloat(get('Debit Amount'))  || 0;
      const credit   = parseFloat(get('Credit Amount')) || 0;
      rawAmount      = credit > 0 ? credit : -debit;
      const bal      = parseFloat(get('Balance')); balance = isNaN(bal) ? undefined : bal;
    } else {
      rawDate        = get('date')   || get('Date');
      rawType        = get('type')   || get('Type');
      rawDescription = get('description') || get('Description');
      rawAmount      = parseFloat(get('amount') || get('Amount')) || 0;
    }

    const matchedRule = typeRules.find(r => r.bankCode.toUpperCase() === rawType.toUpperCase());
    const resolvedType: TransactionType = matchedRule ? matchedRule.mapsTo : (rawAmount >= 0 ? 'income' : 'expense');

    const { resolvedAccountId, resolvedAccountToId, accountMatchWarning } = assignAccountByDirection(
      rawAmount, csvConfig?.accountId || '', rawAccountName, assets, debts,
    );

    rows.push({
      id: `row-${i}-${Date.now()}`,
      rawDate, rawType, rawDescription, rawAmount, balance, bankType,
      resolvedType,
      resolvedDescription: rawDescription,
      resolvedCategory: '',
      resolvedAccountId,
      resolvedAccountToId,
      resolvedNotes: '',
      isTransfer: false,
      isTransferCredit: false,
      skip: false,
      sourceCsvName: fileName,
      rawAccountName,
      accountMatchWarning,
    });
  }
  return rows;
}

function applyTransferMatching(rows: RawRow[], rules: TransferRule[]): RawRow[] {
  const updated = rows.map(r => ({
    ...r,
    isTransfer: false,
    isTransferCredit: false,
    matchedPairId: undefined as string | undefined,
  }));

  for (const rule of rules) {
    const debits  = updated.filter(r => r.rawAmount < 0 && r.rawDescription.toUpperCase().includes(rule.fromDescContains.toUpperCase()));
    const credits = updated.filter(r => r.rawAmount > 0 && r.rawDescription.toUpperCase().includes(rule.toDescContains.toUpperCase()));

    for (const debit of debits) {
      const debitDate = new Date(debit.rawDate).getTime();
      const match = credits.find(credit => {
        if (credit.matchedPairId) return false;
        const daysDiff = Math.abs(debitDate - new Date(credit.rawDate).getTime()) / 86400000;
        return Math.abs(Math.abs(credit.rawAmount) - Math.abs(debit.rawAmount)) < 0.02 && daysDiff <= rule.toleranceDays;
      });

      if (match) {
        const di = updated.findIndex(r => r.id === debit.id);
        const ci = updated.findIndex(r => r.id === match.id);
        updated[di] = {
          ...updated[di],
          isTransfer: true,
          isTransferCredit: false,
          matchedPairId: match.id,
          resolvedType: 'transfer',
          resolvedCategory: 'Transfer',
          resolvedDescription: `Transfer to ${match.bankType === 'natwest' ? 'NatWest' : 'Halifax'}`,
          resolvedAccountId: updated[di].resolvedAccountId || updated[di].resolvedAccountToId,
          resolvedAccountToId: updated[ci].resolvedAccountToId || updated[ci].resolvedAccountId,
        };
        updated[ci] = {
          ...updated[ci],
          isTransfer: true,
          isTransferCredit: true,
          matchedPairId: debit.id,
          resolvedType: 'transfer',
          resolvedCategory: 'Transfer',
          resolvedDescription: `Transfer from ${debit.bankType === 'halifax' ? 'Halifax' : 'NatWest'}`,
        };
      }
    }
  }
  return updated;
}

function downloadCsvTemplate() {
  const template = `date,type,description,amount,account
2026-02-20,DEB,Grocery Store,-45.50,Halifax
2026-02-21,BAC,Salary,2500.00,Halifax
2026-02-22,DEB,Credit Card Payment,-150.00,Halifax#Debt
2026-02-23,DEB,Transfer to Savings,-200.00,Halifax#Savings
2026-02-24,SO,Rent Payment,-800.00,Halifax`;

  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'categorize-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────
// Create Rule Popup
// ────────────────────────────────────────────────
interface CreateRulePopupProps {
  row: RawRow;
  field: 'category' | 'description' | 'type' | 'notes';
  accounts: { id: string; name: string }[];
  categories: string[];
  currencySymbol: string;
  onConfirm: (rule: MerchantRule) => void;
  onDismiss: () => void;
  assets: { id: string; name: string }[];
  debts: { id: string; name: string }[];
}

const CreateRulePopup: React.FC<CreateRulePopupProps> = ({
  row, field, categories, currencySymbol, onConfirm, onDismiss, assets, debts
}) => {
  const [matchDescription, setMatchDescription] = useState(true);
  const [matchType,        setMatchType]        = useState(false);
  const [matchAmount,      setMatchAmount]       = useState(false);
  const [useRegex,         setUseRegex]         = useState(false);
  const [contains,         setContains]         = useState(row.rawDescription);
  const [setDescription,   setSetDescription]   = useState(row.resolvedDescription || row.rawDescription);
  const [setCategory,      setSetCategory]      = useState(field === 'category' ? row.resolvedCategory : '');
  const [setType,          setSetType]          = useState<TransactionType | ''>(field === 'type' ? row.resolvedType : '');
  const [setAccountId,     setSetAccountId]     = useState(row.resolvedAccountId || '');
  const [setAccountToId,   setSetAccountToId]   = useState(row.resolvedAccountToId || '');
  const [setNotes,         setSetNotes]         = useState(field === 'notes' ? row.resolvedNotes : '');

  const isIncome = row.rawAmount >= 0;

  const regexError = useMemo(() => {
    if (!useRegex || !contains) return null;
    try { new RegExp(contains, 'i'); return null; }
    catch (err) { return (err as Error).message; }
  }, [useRegex, contains]);

  const typeOptions: SelectGroup[] = [{
    options: [
      { value: '',             label: '— keep current —' },
      ...TX_TYPE_OPTIONS[0].options,
    ],
  }];

  const acctFromGroups = useMemo(() => buildAccountGroups(assets, debts, '— any account —'), [assets, debts]);
  const acctToGroups   = useMemo(() => buildAccountGroups(assets, debts, '— none —'),        [assets, debts]);

  const handleConfirm = () => {
    onConfirm({
      id: `mr-${Date.now()}`,
      matchDescription, matchType, matchAmount, useRegex, contains,
      matchTypeValue: '', matchAmountValue: '',
      setDescription, setCategory, setType, setAccountId, setAccountToId, setNotes,
    });
  };

  const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
    <button type="button" onClick={() => onChange(!checked)}
      className={clsx('flex items-center gap-2 px-3 py-2 border rounded-sm text-xs transition-colors',
        checked ? 'border-magma/50 bg-magma/10 text-white' : 'border-white/10 bg-white/[0.02] text-iron-dust hover:border-white/20'
      )}>
      <div className={clsx('w-3.5 h-3.5 border rounded-sm flex items-center justify-center shrink-0',
        checked ? 'border-magma bg-magma' : 'border-white/20'
      )}>
        {checked && <Check size={9} className="text-black" />}
      </div>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-[#131517] border-b border-white/5 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-[2px] text-white">Create Description Rule</h3>
            <p className="text-[10px] text-iron-dust font-mono mt-0.5 truncate">{row.rawDescription}</p>
          </div>
          <div className={clsx(
            'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs font-mono font-bold',
            isIncome ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-magma border-magma/30 bg-magma/10'
          )}>
            {isIncome ? '+' : ''}{currencySymbol}{Math.abs(row.rawAmount).toFixed(2)}
            <span className={clsx('text-[9px] uppercase tracking-wider font-normal', isIncome ? 'text-emerald-500' : 'text-magma/70')}>
              {isIncome ? 'income' : 'expense'}
            </span>
          </div>
          <button onClick={onDismiss} className="text-iron-dust hover:text-white shrink-0 mt-0.5"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Match when…</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <CheckRow label="Description contains" checked={matchDescription} onChange={setMatchDescription} />
              <CheckRow label="Type matches"          checked={matchType}        onChange={setMatchType} />
              <CheckRow label="Amount matches"        checked={matchAmount}      onChange={setMatchAmount} />
            </div>
            {matchDescription && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">
                    Description contains{' '}
                    <span className="text-iron-dust/50 normal-case tracking-normal">
                      {useRegex ? '(regex pattern)' : '(edit to broaden, e.g. shorten to a keyword)'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseRegex(!useRegex)}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 border rounded-sm text-[9px] transition-colors',
                      useRegex ? 'border-purple-500/50 bg-purple-500/10 text-purple-300' : 'border-white/10 bg-white/[0.02] text-iron-dust hover:border-white/20',
                    )}
                  >
                    <Code size={10} />
                    {useRegex ? 'Regex ON' : 'Regex OFF'}
                  </button>
                </div>
                <input
                  value={contains}
                  onChange={e => setContains(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white font-mono rounded-sm focus:border-magma outline-none"
                  placeholder={useRegex ? 'e.g. ^(PAYBYPHONE|PARKING).*' : 'e.g. PAYBYPHONE'}
                />
                {regexError && <p className="text-[9px] text-red-400 mt-1 font-mono">⚠ Invalid regex: {regexError}</p>}
                {useRegex && !regexError && (
                  <p className="text-[9px] text-purple-400/60 mt-1 font-mono">
                    Tip: Use .* for wildcards, ^ for start, $ for end, (A|B) for OR
                  </p>
                )}
              </div>
            )}
          </div>

          <hr className="border-white/5" />

          <div>
            <p className="text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-3">Then set…</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Description</label>
                  <input value={setDescription} onChange={e => setSetDescription(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Category</label>
                  <input list="popup-cats" value={setCategory} onChange={e => setSetCategory(e.target.value)} placeholder="e.g. Health"
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none" />
                  <datalist id="popup-cats">{categories.map((c,i) => <option key={i} value={c} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Type</label>
                  <CustomSelect value={setType} onChange={v => setSetType(v as TransactionType | '')} groups={typeOptions} placeholder="— keep current —" triggerClassName="px-3 py-2 text-xs" maxVisibleItems={8} />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account From</label>
                  <CustomSelect value={setAccountId} onChange={setSetAccountId} groups={acctFromGroups} placeholder="— any account —" triggerClassName="px-3 py-2 text-xs" maxVisibleItems={8} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account To (transfers / debt)</label>
                  <CustomSelect value={setAccountToId} onChange={setSetAccountToId} groups={acctToGroups} placeholder="— none —" triggerClassName="px-3 py-2 text-xs" maxVisibleItems={8} />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Add Note</label>
                  <input value={setNotes} onChange={e => setSetNotes(e.target.value)} placeholder="e.g. Health plan payment"
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#131517] border-t border-white/5 flex justify-end gap-3">
          <button onClick={onDismiss}
            className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={(!matchDescription && !matchType && !matchAmount) || !!regexError}
            className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 transition-colors">
            Create Rule
          </button>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────
// SectionCard
// ────────────────────────────────────────────────
const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  onSave?: () => void;
  onDownloadTemplate?: () => void;
  saving?: boolean;
  saved?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, defaultOpen = true, onSave, onDownloadTemplate, saving = false, saved = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-sm bg-[#131517] overflow-hidden">
      <div className="flex items-center bg-[#0f1012]">
        <button onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
          <span className="text-magma">{icon}</span>
          <div className="flex-1">
            <span className="text-xs font-bold uppercase tracking-[2px] text-white block">{title}</span>
            {subtitle && <span className="text-[10px] text-iron-dust font-mono">{subtitle}</span>}
          </div>
        </button>
        {onDownloadTemplate && (
          <button onClick={onDownloadTemplate}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border-l border-white/5 px-4 py-4 transition-colors hover:bg-white/[0.02] text-iron-dust hover:text-white">
            <Download size={11} />
            <span>Template</span>
          </button>
        )}
        {onSave && (
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border-l border-white/5 px-4 py-4 transition-colors disabled:opacity-50 hover:bg-white/[0.02]"
            style={{ color: saved ? '#34d399' : undefined }}>
            {saving
              ? <Loader2 size={11} className="animate-spin text-iron-dust" />
              : saved ? <CheckCircle2 size={11} /> : <Save size={11} className="text-iron-dust" />}
            <span className={saved ? 'text-emerald-400' : 'text-iron-dust'}>{saved ? 'Saved' : 'Save'}</span>
          </button>
        )}
        <button onClick={() => setOpen(v => !v)}
          className="px-4 py-4 text-iron-dust hover:text-white border-l border-white/5 hover:bg-white/[0.02] transition-colors">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
};

// ────────────────────────────────────────────────
// Inline editable cell
// ────────────────────────────────────────────────
interface EditableCellProps {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  type?: 'text' | 'select';
  options?: string[];
  showRulePrompt?: boolean;
  onCreateRule?: () => void;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value, onSave, className, type = 'text', options = [], showRulePrompt = false, onCreateRule
}) => {
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(value);
  const [showPrompt, setShowPrompt] = useState(false);

  const commit = (newVal: string) => {
    onSave(newVal);
    setEditing(false);
    if (showRulePrompt && newVal !== value) setShowPrompt(true);
  };

  if (editing) {
    if (type === 'select') return (
      <select value={draft}
        onChange={e => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => setEditing(false)}
        autoFocus
        className="bg-black border border-magma/50 text-white text-xs px-1 py-0.5 rounded-sm outline-none w-full">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    return (
      <input autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') setEditing(false); }}
        className={clsx('bg-black border border-magma/50 text-white text-xs px-1 py-0.5 rounded-sm outline-none w-full', className)} />
    );
  }

  return (
    <div>
      <span onClick={() => { setDraft(value); setEditing(true); setShowPrompt(false); }}
        className={clsx('cursor-pointer hover:text-white hover:underline underline-offset-2 decoration-dotted transition-colors block', className)}>
        {value || <span className="text-white/20 italic text-[10px]">click to edit</span>}
      </span>
      {showPrompt && showRulePrompt && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] text-iron-dust font-mono">Create a rule?</span>
          <button onClick={() => { setShowPrompt(false); onCreateRule?.(); }}
            className="w-4 h-4 border border-emerald-500/50 bg-emerald-500/10 rounded-sm flex items-center justify-center hover:bg-emerald-500/20 transition-colors">
            <Check size={9} className="text-emerald-400" />
          </button>
          <button onClick={() => setShowPrompt(false)}
            className="w-4 h-4 border border-white/10 bg-white/5 rounded-sm flex items-center justify-center hover:bg-white/10 transition-colors">
            <X size={9} className="text-iron-dust" />
          </button>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────
// Assign CSVs to Account panel
// ────────────────────────────────────────────────
interface CsvAssignPanelProps {
  csvConfigs: CsvConfig[];
  onChange: (name: string, patch: Partial<CsvConfig>) => void;
  accounts: { id: string; name: string }[];
  onAddMore: (files: FileList) => void;
  assets: { id: string; name: string }[];
  debts: { id: string; name: string }[];
}

const CsvAssignPanel: React.FC<CsvAssignPanelProps> = ({ csvConfigs, onChange, onAddMore, assets, debts }) => {
  const addMoreRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acctGroups = useMemo(() => buildAccountGroups(assets, debts, '— select account —'), [assets, debts]);

  if (csvConfigs.length === 0) return null;
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-sm p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-[2px] text-white mb-1">Assign CSVs to Account</p>
      {csvConfigs.map((cfg, cfgIdx) => (
        <div key={cfg.csvName} className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-iron-dust bg-black/30 border border-white/10 px-2.5 py-1.5 rounded-sm shrink-0 max-w-[180px] truncate">
              {cfg.csvName}
            </span>
            <ArrowRight size={12} className="text-iron-dust shrink-0" />
            {cfg.headers.length > 0 && (
              <>
                <span className="text-[10px] text-iron-dust font-mono">Account col:</span>
                <div className="w-36">
                  <CustomSelect
                    value={cfg.accountColumnName}
                    onChange={v => onChange(cfg.csvName, { accountColumnName: v })}
                    groups={[{ options: [{ value: '', label: '— none —' }, ...cfg.headers.map(h => ({ value: h, label: h }))] }]}
                    placeholder="— none —"
                    triggerClassName="px-2 py-1.5 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
                <span className="text-[10px] text-iron-dust font-mono">or</span>
              </>
            )}
            <div className="w-48">
              <CustomSelect
                value={cfg.accountId}
                onChange={v => onChange(cfg.csvName, { accountId: v })}
                groups={acctGroups}
                placeholder="— select account —"
                triggerClassName="px-2 py-1.5 text-xs"
                maxVisibleItems={8}
              />
            </div>
            <div className="flex items-center gap-1">
              <Columns2 size={12} className="text-iron-dust" />
              <span className="text-[10px] text-iron-dust font-mono">Cols:</span>
              <button
                onClick={() => onChange(cfg.csvName, { amountColumns: 1 })}
                className={clsx(
                  'px-2 py-1 text-[10px] font-mono border rounded-sm transition-colors',
                  cfg.amountColumns === 1 ? 'border-magma/50 bg-magma/10 text-white' : 'border-white/10 text-iron-dust hover:border-white/20'
                )}>1</button>
              <button
                onClick={() => onChange(cfg.csvName, { amountColumns: 2 })}
                className={clsx(
                  'px-2 py-1 text-[10px] font-mono border rounded-sm transition-colors',
                  cfg.amountColumns === 2 ? 'border-magma/50 bg-magma/10 text-white' : 'border-white/10 text-iron-dust hover:border-white/20'
                )}>2</button>
            </div>
            {cfg.headers.length > 0 && cfg.amountColumns === 1 && (
              <>
                <span className="text-[10px] text-iron-dust font-mono">Amount col:</span>
                <div className="w-36">
                  <CustomSelect
                    value={cfg.amountCol}
                    onChange={v => onChange(cfg.csvName, { amountCol: v })}
                    groups={[{ options: [{ value: '', label: '— select —' }, ...cfg.headers.map(h => ({ value: h, label: h }))] }]}
                    placeholder="— select —"
                    triggerClassName="px-2 py-1.5 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
              </>
            )}
            {cfg.headers.length > 0 && cfg.amountColumns === 2 && (
              <>
                <span className="text-[10px] text-iron-dust font-mono">Debit:</span>
                <div className="w-32">
                  <CustomSelect
                    value={cfg.debitCol}
                    onChange={v => onChange(cfg.csvName, { debitCol: v })}
                    groups={[{ options: [{ value: '', label: '— select —' }, ...cfg.headers.map(h => ({ value: h, label: h }))] }]}
                    placeholder="— select —"
                    triggerClassName="px-2 py-1.5 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
                <span className="text-[10px] text-iron-dust font-mono">Credit:</span>
                <div className="w-32">
                  <CustomSelect
                    value={cfg.creditCol}
                    onChange={v => onChange(cfg.csvName, { creditCol: v })}
                    groups={[{ options: [{ value: '', label: '— select —' }, ...cfg.headers.map(h => ({ value: h, label: h }))] }]}
                    placeholder="— select —"
                    triggerClassName="px-2 py-1.5 text-xs"
                    maxVisibleItems={8}
                  />
                </div>
              </>
            )}
          </div>
          {cfgIdx < csvConfigs.length - 1 && <hr className="border-white/5" />}
        </div>
      ))}
      <div
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) onAddMore(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => addMoreRef.current?.click()}
        className={clsx(
          'mt-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-sm cursor-pointer transition-colors text-xs',
          dragging ? 'border-magma/60 bg-magma/5 text-white' : 'border-white/10 text-iron-dust hover:border-white/20 hover:text-white'
        )}>
        <Plus size={12} />
        <span className="font-mono">Add more CSVs…</span>
        <input ref={addMoreRef} type="file" accept=".csv" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) { onAddMore(e.target.files); e.target.value = ''; } }} />
      </div>
      <div className="text-[10px] text-iron-dust/70 font-mono space-y-1">
        <p>• Use account column for multi-account CSVs (e.g. Halifax, Halifax#Debt, Halifax#Savings)</p>
        <p>• Use single account selector if all rows belong to one account</p>
        <p>• You can still override account per-row in the preview table</p>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────
export const Categorize: React.FC = () => {
  const { data, currencySymbol } = useFinance();
  const {
    typeRules, setTypeRules,
    merchantRules, setMerchantRules,
    transferRules, setTransferRules,
    loading, saving, saved,
    saveTypeRules, saveMerchantRules, saveTransferRules,
    persistMerchantRule,
    updateMerchantRule:  dbUpdateMerchantRule,
    deleteMerchantRule:  dbDeleteMerchantRule,
  } = useImportRules();

  const [rows,              setRows]              = useState<RawRow[]>([]);
  const [importing,         setImporting]         = useState(false);
  const [importDone,        setImportDone]        = useState(false);
  const [importCount,       setImportCount]       = useState(0);
  const [activeTab,         setActiveTab]         = useState<'rules' | 'preview'>('rules');
  const [filterType,        setFilterType]        = useState<string>('all');
  const [filterAccount,     setFilterAccount]     = useState<string>('all');
  const [filterCategorySet, setFilterCategorySet] = useState<'all' | 'with' | 'without'>('all');
  const [currentPage,       setCurrentPage]       = useState(1);
  const [perPage,           setPerPage]           = useState(50);
  const [rulePopup,         setRulePopup]         = useState<{ row: RawRow; field: 'category' | 'description' | 'type' | 'notes' } | null>(null);
  const [editingRule,       setEditingRule]       = useState<MerchantRule | null>(null);
  const [csvConfigs,        setCsvConfigs]        = useState<CsvConfig[]>([]);
  const pendingCsvsRef = useRef<Map<string, string>>(new Map());
  const [pendingCsvs,  setPendingCsvs]   = useState<{ name: string; text: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const allAccounts      = useMemo(() => [...data.assets, ...data.debts], [data.assets, data.debts]);
  const uniqueCategories = useMemo(() => Array.from(new Set(data.transactions.map(t => t.category))).sort(), [data.transactions]);
  const uniqueBankCodes  = useMemo(() => Array.from(new Set(rows.map(r => r.rawType))).filter(Boolean), [rows]);

  const unmatchedAccounts = useMemo(() => {
    const warnings = new Set<string>();
    rows.forEach(r => { if (r.accountMatchWarning) warnings.add(r.rawAccountName || 'Unknown'); });
    return Array.from(warnings);
  }, [rows]);

  const filterTypeGroups = useMemo<SelectGroup[]>(() => [{
    options: [{ value: 'all', label: 'All Types' }, ...TX_TYPE_OPTIONS[0].options],
  }], []);

  const filterAccountGroups = useMemo<SelectGroup[]>(() => [
    { options: [{ value: 'all', label: 'All Accounts' }] },
    ...(data.assets.length > 0 ? [{ label: 'Assets', options: data.assets.map(a => ({ value: a.id, label: a.name })) }] : []),
    ...(data.debts.length  > 0 ? [{ label: 'Debts',  options: data.debts.map(d => ({ value: d.id, label: d.name })) }] : []),
  ], [data.assets, data.debts]);

  const rowAccountGroups = useMemo<SelectGroup[]>(() => buildAccountGroups(data.assets, data.debts, '\u2014 assign \u2014'), [data.assets, data.debts]);

  const filteredRows = useMemo(() => rows.filter(r => {
    if (filterType        !== 'all' && r.resolvedType      !== filterType)    return false;
    if (filterAccount     !== 'all' && r.resolvedAccountId !== filterAccount) return false;
    if (filterCategorySet === 'with'    && !r.resolvedCategory) return false;
    if (filterCategorySet === 'without' &&  r.resolvedCategory) return false;
    return true;
  }), [rows, filterType, filterAccount, filterCategorySet]);

  const totalPages   = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const safePage     = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return filteredRows.slice(start, start + perPage);
  }, [filteredRows, safePage, perPage]);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  const stats = useMemo(() => ({
    total:     rows.length,
    skipped:   rows.filter(r => r.skip).length,
    transfers: rows.filter(r => r.isTransfer && !r.isTransferCredit).length,
    toImport:  rows.filter(r => !r.skip && !r.isTransferCredit && (r.resolvedAccountId || r.resolvedAccountToId)).length,
    unmapped:  rows.filter(r => r.accountMatchWarning).length,
  }), [rows]);

  const buildInitialConfig = (name: string, text: string): CsvConfig => {
    const firstLine = text.split('\n').find(l => l.trim());
    const headers   = firstLine ? parseCSVLine(firstLine).map(h => h.replace(/'/g,'').trim()) : [];
    const hLower = headers.map(h => h.toLowerCase());
    const isHalifax = hLower.includes('sort code');
    return {
      csvName: name,
      accountId: '',
      accountColumnName: headers.find(h => h.toLowerCase() === 'account') || '',
      amountColumns: isHalifax ? 2 : 1,
      amountCol: headers.find(h => ['value','amount'].includes(h.toLowerCase())) || '',
      debitCol:  headers.find(h => h.toLowerCase().includes('debit'))  || '',
      creditCol: headers.find(h => h.toLowerCase().includes('credit')) || '',
      headers,
    };
  };

  const typeRulesRef     = useRef(typeRules);
  const merchantRulesRef = useRef(merchantRules);
  const transferRulesRef = useRef(transferRules);
  typeRulesRef.current     = typeRules;
  merchantRulesRef.current = merchantRules;
  transferRulesRef.current = transferRules;

  const rebuildRows = useCallback((
    csvs: { name: string; text: string }[],
    configs: CsvConfig[],
  ): RawRow[] => {
    const allRowsArr: RawRow[] = [];
    for (const csv of csvs) {
      const cfg = configs.find(c => c.csvName === csv.name) || null;
      let parsed = parseCSV(csv.text, csv.name, typeRulesRef.current, cfg, data.assets, data.debts);
      parsed = applyMerchantRules(parsed as any, merchantRulesRef.current) as RawRow[];
      allRowsArr.push(...parsed);
    }
    return applyTransferMatching(allRowsArr, transferRulesRef.current);
  }, [data.assets, data.debts]);

  const loadFiles = useCallback((files: FileList, existingConfigs: CsvConfig[]) => {
    const fileArr = Array.from(files);
    let remaining = fileArr.length;
    if (remaining === 0) return;

    fileArr.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string;
        pendingCsvsRef.current.set(file.name, text);
        remaining--;
        if (remaining === 0) {
          const allCsvs = Array.from(pendingCsvsRef.current.entries()).map(([name, text]) => ({ name, text }));
          const merged = allCsvs.map(csv => {
            return existingConfigs.find(c => c.csvName === csv.name) || buildInitialConfig(csv.name, csv.text);
          });
          setPendingCsvs(allCsvs);
          setCsvConfigs(merged);
          setRows(rebuildRows(allCsvs, merged));
          setActiveTab('preview');
          setImportDone(false);
          resetPage();
        }
      };
      reader.readAsText(file);
    });
  }, [rebuildRows, resetPage]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    pendingCsvsRef.current = new Map();
    loadFiles(files, []);
  }, [loadFiles]);

  const handleAddMore = useCallback((files: FileList) => {
    setCsvConfigs(currentConfigs => {
      loadFiles(files, currentConfigs);
      return currentConfigs;
    });
  }, [loadFiles]);

  const updateCsvConfig = useCallback((csvName: string, patch: Partial<CsvConfig>) => {
    setCsvConfigs(prev => {
      const updated = prev.map(c => c.csvName === csvName ? { ...c, ...patch } : c);
      setRows(rebuildRows(pendingCsvs, updated));
      return updated;
    });
  }, [pendingCsvs, rebuildRows]);

  const reapplyRules = useCallback(() => {
    setRows(prev => {
      let updated = prev.map(r => {
        const matchedRule = typeRules.find(tr => tr.bankCode.toUpperCase() === r.rawType.toUpperCase());
        const resolvedType: TransactionType = matchedRule ? matchedRule.mapsTo : (r.rawAmount >= 0 ? 'income' : 'expense');
        return { ...r, resolvedType };
      });
      updated = applyMerchantRules(updated as any, merchantRules) as RawRow[];
      updated = applyTransferMatching(updated, transferRules);
      return updated;
    });
  }, [typeRules, merchantRules, transferRules]);

  const updateRow = (id: string, patch: Partial<RawRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const bulkSetType = (bankCode: string, newType: TransactionType) =>
    setRows(prev => prev.map(r => r.rawType.toUpperCase() === bankCode.toUpperCase() ? { ...r, resolvedType: newType } : r));

  const handleImport = async () => {
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { console.error('handleImport: no active session'); setImporting(false); return; }

      const toImport = rows.filter(r => !r.skip && !r.isTransferCredit && (r.resolvedAccountId || r.resolvedAccountToId));
      const debtIdSet = new Set(data.debts.map(d => d.id));

      const records = toImport.map(row => {
        const primaryId     = row.resolvedAccountId || row.resolvedAccountToId;
        const isPrimaryDebt = debtIdSet.has(primaryId);
        const rawAccountToId = row.resolvedAccountToId || null;
        const accountToId    = rawAccountToId && debtIdSet.has(rawAccountToId) ? null : rawAccountToId;
        const date = row.rawDate ? row.rawDate.substring(0, 10) : row.rawDate;
        return {
          user_id:       session.user.id,
          account_id:    isPrimaryDebt ? null : (primaryId || null),
          debt_id:       isPrimaryDebt ? primaryId : null,
          account_to_id: accountToId,
          date,
          description:   row.resolvedDescription || row.rawDescription,
          amount:        row.rawAmount,
          type:          row.resolvedType,
          category:      row.resolvedCategory || 'General',
          notes:         row.resolvedNotes || null,
          symbol: null, quantity: null, price: null, currency: null,
        };
      });

      const { data: inserted, error } = await supabase.from('transactions').insert(records).select();
      if (error) { console.error('handleImport: batch insert failed:', error); setImporting(false); return; }
      setImportCount(inserted?.length ?? records.length);
    } catch (err) {
      console.error('handleImport: unexpected error:', err);
    } finally {
      setImporting(false);
      setImportDone(true);
      setRows([]);
      setPendingCsvs([]);
      setCsvConfigs([]);
      pendingCsvsRef.current = new Map();
    }
  };

  const addTypeRule    = () => setTypeRules(prev => [...prev, { id: `tr-${Date.now()}`, bankCode: '', mapsTo: 'expense' }]);
  const removeTypeRule = (id: string) => setTypeRules(prev => prev.filter(r => r.id !== id));
  const updateTypeRule = (id: string, patch: Partial<TypeMappingRule>) => setTypeRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addMerchantRule = () => setMerchantRules(prev => [...prev, { ...BLANK_MERCHANT_RULE, id: `mr-${Date.now()}` }]);
  const removeMerchantRule = async (id: string) => {
    setMerchantRules(prev => prev.filter(r => r.id !== id));
    await dbDeleteMerchantRule(id);
  };
  const patchMerchantRule = (id: string, patch: Partial<MerchantRule>) =>
    setMerchantRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const handleEditRuleSave = useCallback(async (updated: MerchantRule) => {
    setMerchantRules(prev => prev.map(r => r.id === updated.id ? updated : r));
    setEditingRule(null);
    await dbUpdateMerchantRule(updated);
    if (rows.length > 0) {
      setRows(prev => applyMerchantRules(prev as any, [updated, ...merchantRules.filter(r => r.id !== updated.id)]) as RawRow[]);
    }
  }, [dbUpdateMerchantRule, rows.length, merchantRules]);

  const addTransferRule    = () => setTransferRules(prev => [...prev, { id: `tfr-${Date.now()}`, label: '', fromDescContains: '', toDescContains: '', toleranceDays: 2 }]);
  const removeTransferRule = (id: string) => setTransferRules(prev => prev.filter(r => r.id !== id));
  const updateTransferRule = (id: string, patch: Partial<TransferRule>) => setTransferRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const handleRuleConfirm = useCallback(async (rule: MerchantRule) => {
    const updatedRules = [...merchantRules, rule];
    setMerchantRules(updatedRules);
    setRulePopup(null);
    setRows(prev => applyMerchantRules(prev as any, updatedRules) as RawRow[]);
    const persisted = await persistMerchantRule(rule);
    if (persisted.id !== rule.id) {
      setMerchantRules(prev => prev.map(r => r.id === rule.id ? { ...r, id: persisted.id } : r));
    }
  }, [merchantRules, persistMerchantRule]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-iron-dust">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-xs font-mono">Loading rules\u2026</p>
        </div>
      </div>
    );
  }

  const categoryFilterGroups: SelectGroup[] = [{
    options: [
      { value: 'all',     label: 'All Categories' },
      { value: 'with',    label: 'With Category' },
      { value: 'without', label: 'Without Category' },
    ],
  }];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-7xl mx-auto pb-24">

        <div className="mb-8">
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Tools</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">Categorize &amp; Import</h1>
          <p className="text-iron-dust text-sm mt-2">Set rules for cleaning bank CSVs, match transfers, then import in bulk.</p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-white/10">
          {(['rules', 'preview'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={clsx('px-5 py-3 text-xs font-bold uppercase tracking-[2px] border-b-2 transition-colors -mb-px',
                activeTab === tab ? 'border-magma text-white' : 'border-transparent text-iron-dust hover:text-white'
              )}>
              {tab === 'rules' ? 'Rules & Config' : `Preview${rows.length ? ` (${rows.length})` : ''}`}
            </button>
          ))}
        </div>

        {activeTab === 'rules' && (
          <div className="space-y-4">

            <SectionCard
              title="Type Code \u2192 Transaction Type"
              subtitle="Map your bank's type codes (BAC, D/D, SO\u2026) to Lithos types"
              icon={<Shuffle size={14} />}
              onSave={saveTypeRules}
              saving={saving['type']}
              saved={saved['type']}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                {typeRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-2">
                    <input value={rule.bankCode}
                      onChange={e => updateTypeRule(rule.id, { bankCode: e.target.value })}
                      placeholder="Code"
                      className="w-20 bg-black/30 border border-white/10 px-2 py-2 text-xs font-mono text-white rounded-sm focus:border-magma outline-none uppercase" />
                    <ArrowRight size={11} className="text-iron-dust shrink-0" />
                    <div className="flex-1">
                      <CustomSelect
                        value={rule.mapsTo}
                        onChange={v => updateTypeRule(rule.id, { mapsTo: v as TransactionType })}
                        groups={TX_TYPE_OPTIONS}
                        placeholder="type\u2026"
                        triggerClassName="px-2 py-2 text-xs"
                        maxVisibleItems={8}
                      />
                    </div>
                    <button onClick={() => removeTypeRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors shrink-0"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addTypeRule} className="mt-3 flex items-center gap-1.5 text-xs text-iron-dust hover:text-white transition-colors">
                <Plus size={13} /><span>Add Rule</span>
              </button>
            </SectionCard>

            <SectionCard
              title="Description Rules"
              subtitle="Auto-set description, category, type, or accounts when conditions are matched"
              icon={<Tag size={14} />}
              onSave={saveMerchantRules}
              saving={saving['merchant']}
              saved={saved['merchant']}>
              {merchantRules.length === 0 ? (
                <p className="text-iron-dust text-xs font-mono mb-2">No rules yet \u2014 add one or create from the preview table.</p>
              ) : (
                <div className="border border-white/10 rounded-sm overflow-hidden mb-3">
                  <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_3.5rem] gap-2 px-3 py-2 bg-[#0f1012] border-b border-white/10">
                    {['Contains', 'Set Description', 'Category', 'Type', 'Acct From', 'Acct To', ''].map((h, i) => (
                      <span key={i} className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {merchantRules.map(rule => (
                    <div key={rule.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_3.5rem] gap-2 items-center px-3 py-2 hover:bg-white/[0.02] transition-colors">
                      <input value={rule.contains} onChange={e => patchMerchantRule(rule.id, { contains: e.target.value })} placeholder="e.g. DENPLAN"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.setDescription} onChange={e => patchMerchantRule(rule.id, { setDescription: e.target.value })} placeholder="e.g. Denplan"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input list={`cats-${rule.id}`} value={rule.setCategory} onChange={e => patchMerchantRule(rule.id, { setCategory: e.target.value })} placeholder="e.g. Health"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <datalist id={`cats-${rule.id}`}>{uniqueCategories.map((c,i) => <option key={i} value={c} />)}</datalist>
                      <CustomSelect value={rule.setType} onChange={v => patchMerchantRule(rule.id, { setType: v as TransactionType | '' })}
                        groups={[{ options: [{ value: '', label: '\u2014 keep \u2014' }, ...TX_TYPE_OPTIONS[0].options] }]}
                        placeholder="\u2014 keep \u2014" triggerClassName="px-2 py-1.5 text-xs" maxVisibleItems={8} />
                      <CustomSelect value={rule.setAccountId} onChange={v => patchMerchantRule(rule.id, { setAccountId: v })}
                        groups={buildAccountGroups(data.assets, data.debts, '\u2014 any \u2014')}
                        placeholder="\u2014 any \u2014" triggerClassName="px-2 py-1.5 text-xs" maxVisibleItems={8} />
                      <CustomSelect value={rule.setAccountToId} onChange={v => patchMerchantRule(rule.id, { setAccountToId: v })}
                        groups={buildAccountGroups(data.assets, data.debts, '\u2014 none \u2014')}
                        placeholder="\u2014 none \u2014" triggerClassName="px-2 py-1.5 text-xs" maxVisibleItems={8} />
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditingRule(rule)} title="Edit rule"
                          className="w-6 h-6 flex items-center justify-center text-iron-dust hover:text-white border border-white/10 hover:border-white/20 rounded-sm transition-colors">
                          <Pencil size={10} />
                        </button>
                        <button onClick={() => removeMerchantRule(rule.id)} title="Delete rule"
                          className="w-6 h-6 flex items-center justify-center text-iron-dust hover:text-magma border border-white/10 hover:border-magma/30 rounded-sm transition-colors">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addMerchantRule} className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white transition-colors">
                <Plus size={13} /><span>Add Rule</span>
              </button>
            </SectionCard>

            <SectionCard
              title="Transfer Matching Rules"
              subtitle="Match debits + credits by description pattern, amount & date tolerance"
              icon={<Link2 size={14} />}
              onSave={saveTransferRules}
              saving={saving['transfer']}
              saved={saved['transfer']}>
              {transferRules.length === 0 ? (
                <p className="text-iron-dust text-xs font-mono mb-2">No rules yet.</p>
              ) : (
                <div className="border border-white/10 rounded-sm overflow-hidden mb-3">
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_4rem_2rem] gap-3 px-3 py-2 bg-[#0f1012] border-b border-white/10">
                    {['Label', 'Debit contains', 'Credit contains', '\u00b1Days', ''].map((h, i) => (
                      <span key={i} className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {transferRules.map(rule => (
                    <div key={rule.id} className="grid grid-cols-[1.5fr_1fr_1fr_4rem_2rem] gap-3 items-center px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                      <input value={rule.label} onChange={e => updateTransferRule(rule.id, { label: e.target.value })} placeholder="e.g. Halifax \u2192 NatWest"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.fromDescContains} onChange={e => updateTransferRule(rule.id, { fromDescContains: e.target.value })} placeholder="e.g. CAMERON REES"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.toDescContains} onChange={e => updateTransferRule(rule.id, { toDescContains: e.target.value })} placeholder="e.g. C REES"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input type="number" min={0} max={7} value={rule.toleranceDays} onChange={e => updateTransferRule(rule.id, { toleranceDays: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none font-mono" />
                      <button onClick={() => removeTransferRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors flex items-center justify-center"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addTransferRule} className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white transition-colors">
                <Plus size={13} /><span>Add Rule</span>
              </button>
            </SectionCard>

            <SectionCard
              title="Upload Bank CSV(s)"
              subtitle="Drop one or more files \u2014 NatWest & Halifax auto-detected"
              icon={<Upload size={14} />}
              onDownloadTemplate={downloadCsvTemplate}>
              <div
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-magma/50 rounded-sm p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors group">
                <Upload size={28} className="text-iron-dust group-hover:text-magma transition-colors" />
                <p className="text-sm text-iron-dust">Drop CSV files here or click to browse</p>
                <p className="text-xs text-iron-dust/50 font-mono">NatWest \u00b7 Halifax \u00b7 Generic CSV</p>
                <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </div>
            </SectionCard>

          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-4">

            {importDone && (
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm p-4">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="text-sm text-emerald-300 font-mono">Successfully imported <strong>{importCount}</strong> transactions.</span>
              </div>
            )}

            {rows.length === 0 && !importDone && (
              <div className="border border-dashed border-white/10 rounded-sm p-16 flex flex-col items-center gap-3 text-iron-dust">
                <Upload size={24} />
                <p className="text-sm font-mono">No data loaded. Go to Rules &amp; Config and upload a CSV.</p>
              </div>
            )}

            {rows.length > 0 && (
              <>
                {unmatchedAccounts.length > 0 && (
                  <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-sm p-4">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-300 mb-1">Account Name Mismatch</p>
                      <p className="text-xs text-amber-200/80 mb-2">
                        The following account names from your CSV could not be matched. Create these accounts first or check the naming convention:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {unmatchedAccounts.map(name => (
                          <span key={name} className="px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-sm text-xs font-mono text-amber-200">{name}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-200/60 mt-2 font-mono">
                        Use: AccountName = Asset, AccountName#Debt = Debt, AccountName#Savings = Savings
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Rows',  value: stats.total,     color: 'text-white' },
                    { label: 'To Import',   value: stats.toImport,  color: 'text-emerald-400' },
                    { label: 'Transfers',   value: stats.transfers, color: 'text-blue-400' },
                    { label: 'Skipped',     value: stats.skipped,   color: 'text-iron-dust' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#131517] border border-white/10 rounded-sm p-4 relative">
                      <div className={clsx('text-2xl font-bold font-mono', s.color)}>{s.value}</div>
                      <div className="text-[10px] text-iron-dust uppercase tracking-wider mt-1">{s.label}</div>
                      {s.label === 'To Import' && stats.unmapped > 0 && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-sm">
                          <AlertTriangle size={9} className="text-amber-400" />
                          <span className="text-[9px] font-mono text-amber-300">{stats.unmapped} unmapped</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <CsvAssignPanel
                  csvConfigs={csvConfigs}
                  onChange={updateCsvConfig}
                  accounts={allAccounts}
                  assets={data.assets}
                  debts={data.debts}
                  onAddMore={handleAddMore}
                />

                {uniqueBankCodes.length > 0 && (
                  <div className="bg-[#131517] border border-white/10 rounded-sm p-4">
                    <p className="text-xs font-bold uppercase tracking-[2px] text-white mb-3">Bulk Override by Bank Code</p>
                    <div className="flex flex-wrap gap-3">
                      {uniqueBankCodes.map(code => (
                        <div key={code} className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-black/40 border border-white/10 px-2 py-1 rounded-sm text-iron-dust">{code}</span>
                          <ArrowRight size={10} className="text-iron-dust" />
                          <div className="w-36">
                            <CustomSelect value="" onChange={v => v && bulkSetType(code, v as TransactionType)}
                              groups={[{ options: [{ value: '', label: 'bulk set\u2026' }, ...TX_TYPE_OPTIONS[0].options] }]}
                              placeholder="bulk set\u2026" triggerClassName="px-2 py-1 text-xs" maxVisibleItems={8} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Filter bar + Pagination ── */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter size={12} className="text-iron-dust shrink-0" />
                  <div className="w-36">
                    <CustomSelect value={filterType} onChange={v => { setFilterType(v); resetPage(); }}
                      groups={filterTypeGroups} placeholder="All Types" maxVisibleItems={8} />
                  </div>
                  <div className="w-44">
                    <CustomSelect value={filterAccount} onChange={v => { setFilterAccount(v); resetPage(); }}
                      groups={filterAccountGroups} placeholder="All Accounts" maxVisibleItems={8} />
                  </div>
                  <div className="w-44">
                    <CustomSelect
                      value={filterCategorySet}
                      onChange={v => { setFilterCategorySet(v as 'all' | 'with' | 'without'); resetPage(); }}
                      groups={categoryFilterGroups}
                      placeholder="All Categories"
                      maxVisibleItems={8}
                    />
                  </div>

                  <button onClick={() => { reapplyRules(); resetPage(); }}
                    className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-sm transition-colors">
                    <RefreshCcw size={11} /><span>Re-apply Rules</span>
                  </button>

                  <span className="text-xs text-iron-dust font-mono ml-auto">{filteredRows.length} rows</span>

                  {/* Per-page selector */}
                  <select
                    value={perPage}
                    onChange={e => { setPerPage(Number(e.target.value)); resetPage(); }}
                    className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-sm text-xs font-mono text-iron-dust hover:text-white hover:bg-white/10 transition-colors cursor-pointer outline-none">
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>

                  {/* Page prev/next */}
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="w-7 h-7 flex items-center justify-center bg-white/5 border border-white/10 rounded-sm text-iron-dust hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={13} />
                  </button>
                  <span className="text-xs font-mono text-white tabular-nums">
                    {safePage}&nbsp;/&nbsp;{totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="w-7 h-7 flex items-center justify-center bg-white/5 border border-white/10 rounded-sm text-iron-dust hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="border border-white/10 rounded-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#0f1012] border-b border-white/10">
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider w-8">
                            <input type="checkbox"
                              onChange={e => setRows(prev => prev.map(r => ({ ...r, skip: e.target.checked })))}
                              className="accent-magma" />
                          </th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Date</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Code</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider min-w-[160px]">Description</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Category</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Type</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Acct From</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Acct To</th>
                          <th className="px-3 py-3 text-right font-mono text-iron-dust uppercase tracking-wider">Amount</th>
                          <th className="px-3 py-3 text-center font-mono text-iron-dust uppercase tracking-wider">Skip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((row, idx) => {
                          const globalIdx = (safePage - 1) * perPage + idx;
                          return (
                            <tr key={row.id}
                              className={clsx(
                                'border-b border-white/5 transition-colors',
                                row.skip             ? 'opacity-30 bg-black/20' :
                                row.isTransferCredit ? 'opacity-40 bg-white/[0.01]' :
                                row.isTransfer       ? 'bg-blue-500/5 hover:bg-blue-500/10' :
                                row.accountMatchWarning ? 'bg-amber-500/5 hover:bg-amber-500/10' :
                                globalIdx % 2 === 0  ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-white/[0.01] hover:bg-white/[0.03]'
                              )}>
                              <td className="px-3 py-2 text-iron-dust/40 font-mono text-[10px]">
                                {row.accountMatchWarning ? (
                                  <div className="flex items-center gap-1" title={row.accountMatchWarning}>
                                    <AlertTriangle size={10} className="text-amber-400" />
                                    <span>{globalIdx + 1}</span>
                                  </div>
                                ) : globalIdx + 1}
                              </td>
                              <td className="px-3 py-2 font-mono text-iron-dust text-[11px] whitespace-nowrap">{row.rawDate}</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 rounded-sm font-mono text-[10px] text-iron-dust">{row.rawType}</span>
                              </td>
                              <td className="px-3 py-2 max-w-[220px]">
                                <EditableCell value={row.resolvedDescription} onSave={v => updateRow(row.id, { resolvedDescription: v })}
                                  className="text-white text-[11px]" showRulePrompt onCreateRule={() => setRulePopup({ row, field: 'description' })} />
                                {row.accountMatchWarning && (
                                  <span className="text-[9px] font-mono text-amber-400 block mt-0.5" title={row.accountMatchWarning}>
                                    \u26a0 {row.rawAccountName} not found
                                  </span>
                                )}
                                {row.isTransfer && !row.isTransferCredit && <span className="text-[9px] font-mono text-blue-400 block mt-0.5">\u2194 transfer (debit side)</span>}
                                {row.isTransferCredit && <span className="text-[9px] font-mono text-white/30 block mt-0.5">\u2194 mirror \u2014 will be skipped</span>}
                              </td>
                              <td className="px-3 py-2">
                                <EditableCell value={row.resolvedCategory} onSave={v => updateRow(row.id, { resolvedCategory: v })}
                                  className="text-iron-dust text-[11px]" showRulePrompt onCreateRule={() => setRulePopup({ row, field: 'category' })} />
                              </td>
                              <td className="px-3 py-2">
                                <EditableCell value={row.resolvedType} onSave={v => updateRow(row.id, { resolvedType: v as TransactionType })}
                                  type="select" options={TX_TYPES} showRulePrompt onCreateRule={() => setRulePopup({ row, field: 'type' })}
                                  className={clsx('font-mono text-[10px] px-1.5 py-0.5 rounded-sm border',
                                    row.resolvedType === 'income'       ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' :
                                    row.resolvedType === 'expense'      ? 'text-magma border-magma/20 bg-magma/10' :
                                    row.resolvedType === 'transfer'     ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
                                    row.resolvedType === 'debt_payment' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' :
                                                                          'text-purple-400 border-purple-400/20 bg-purple-400/10'
                                  )} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="w-32">
                                  <CustomSelect value={row.resolvedAccountId} onChange={v => updateRow(row.id, { resolvedAccountId: v, accountMatchWarning: undefined })}
                                    groups={rowAccountGroups} placeholder="\u2014 assign \u2014" triggerClassName="px-2 py-1.5 text-xs" maxVisibleItems={8} />
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="w-32">
                                  <CustomSelect value={row.resolvedAccountToId} onChange={v => updateRow(row.id, { resolvedAccountToId: v, accountMatchWarning: undefined })}
                                    groups={rowAccountGroups} placeholder="\u2014 assign \u2014" triggerClassName="px-2 py-1.5 text-xs" maxVisibleItems={8} />
                                </div>
                              </td>
                              <td className={clsx('px-3 py-2 text-right font-mono font-bold text-[11px]',
                                row.rawAmount >= 0 ? 'text-emerald-400' : 'text-magma'
                              )}>
                                {row.rawAmount >= 0 ? '+' : ''}{currencySymbol}{Math.abs(row.rawAmount).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => updateRow(row.id, { skip: !row.skip })}
                                  className={clsx('w-5 h-5 rounded-sm border flex items-center justify-center mx-auto transition-colors',
                                    row.skip ? 'bg-white/10 border-white/20 text-iron-dust' : 'border-white/10 text-transparent hover:border-white/30'
                                  )}><X size={10} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#131517] border border-white/10 rounded-sm p-4">
                  <div>
                    <p className="text-sm font-bold text-white">{stats.toImport} transactions ready to import</p>
                    {rows.some(r => !r.skip && !r.isTransferCredit && !r.resolvedAccountId && !r.resolvedAccountToId) && (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle size={11} /> Some rows have no account assigned and will be skipped.
                      </p>
                    )}
                  </div>
                  <button onClick={handleImport} disabled={importing || stats.toImport === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {importing
                      ? <><div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Importing\u2026</span></>
                      : <><Save size={13} /><span>Import {stats.toImport} Transactions</span></>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {rulePopup && (
        <CreateRulePopup
          row={rulePopup.row}
          field={rulePopup.field}
          accounts={allAccounts}
          assets={data.assets}
          debts={data.debts}
          categories={uniqueCategories}
          currencySymbol={currencySymbol}
          onConfirm={handleRuleConfirm}
          onDismiss={() => setRulePopup(null)}
        />
      )}

      {editingRule && (
        <EditRuleModal
          rule={editingRule}
          assets={data.assets}
          debts={data.debts}
          categories={uniqueCategories}
          onSave={handleEditRuleSave}
          onDismiss={() => setEditingRule(null)}
        />
      )}
    </div>
  );
};
