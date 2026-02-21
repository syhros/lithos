import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload, Plus, Trash2, Save, ChevronDown, ChevronUp,
  ArrowRight, Tag, Shuffle, RefreshCcw,
  CheckCircle2, AlertCircle, X, Check, Filter, Link2, Loader2, Columns2
} from 'lucide-react';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { TransactionType } from '../data/mockData';
import {
  useImportRules,
  TypeMappingRule,
  MerchantRule,
  TransferRule,
} from '../hooks/useImportRules';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
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
  skip: boolean;
  sourceCsvName: string;
}

export interface CsvConfig {
  csvName: string;
  accountId: string;
  amountColumns: 1 | 2;
  amountCol: string;
  debitCol: string;
  creditCol: string;
  headers: string[];
}

const TX_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'debt_payment', 'investing'];

// ─────────────────────────────────────────────
// CSV Parse helpers
// ─────────────────────────────────────────────
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

/**
 * Assign account based on transaction direction:
 *   credit (rawAmount >= 0, income) → money arrives INTO the account  → resolvedAccountToId
 *   debit  (rawAmount <  0, expense)→ money leaves FROM the account   → resolvedAccountId
 *
 * This means:
 *   - For a Halifax/NatWest CSV where accountId = "Halifax Current":
 *       a salary credit  → acctTo  = Halifax Current  (money going in)
 *       a direct debit   → acctFrom = Halifax Current (money going out)
 */
function assignAccountByDirection(
  rawAmount: number,
  csvAccountId: string,
): { resolvedAccountId: string; resolvedAccountToId: string } {
  if (!csvAccountId) return { resolvedAccountId: '', resolvedAccountToId: '' };
  if (rawAmount >= 0) {
    // Credit / income — destination account
    return { resolvedAccountId: '', resolvedAccountToId: csvAccountId };
  } else {
    // Debit / expense — source account
    return { resolvedAccountId: csvAccountId, resolvedAccountToId: '' };
  }
}

function parseCSV(
  text: string,
  fileName: string,
  typeRules: TypeMappingRule[],
  csvConfig: CsvConfig | null,
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

    // Route account assignment based on money direction
    const { resolvedAccountId, resolvedAccountToId } = assignAccountByDirection(
      rawAmount,
      csvConfig?.accountId || '',
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
      skip: false,
      sourceCsvName: fileName,
    });
  }
  return rows;
}

function applyMerchantRules(rows: RawRow[], rules: MerchantRule[]): RawRow[] {
  return rows.map(row => {
    let r = { ...row };
    for (const rule of rules) {
      if (!rule.contains) continue;
      const descMatch = rule.matchDescription && r.rawDescription.toLowerCase().includes(rule.contains.toLowerCase());
      if (descMatch) {
        if (rule.setDescription) r.resolvedDescription = rule.setDescription;
        if (rule.setCategory)    r.resolvedCategory    = rule.setCategory;
        if (rule.setType)        r.resolvedType        = rule.setType as TransactionType;
        if (rule.setAccountId)   r.resolvedAccountId   = rule.setAccountId;
        if (rule.setAccountToId) r.resolvedAccountToId = rule.setAccountToId;
        if (rule.setNotes)       r.resolvedNotes       = rule.setNotes;
        break;
      }
    }
    return r;
  });
}

function applyTransferMatching(rows: RawRow[], rules: TransferRule[]): RawRow[] {
  const updated = rows.map(r => ({ ...r, isTransfer: false, matchedPairId: undefined as string | undefined }));
  for (const rule of rules) {
    const debits  = updated.filter(r => r.rawAmount < 0  && r.rawDescription.toUpperCase().includes(rule.fromDescContains.toUpperCase()));
    const credits = updated.filter(r => r.rawAmount > 0  && r.rawDescription.toUpperCase().includes(rule.toDescContains.toUpperCase()));
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
        // For matched transfers: debit row = money leaving debit.accountId → going to credit.accountId
        // Keep each side's own account assignment, just mark as transfer and set accountToId cross-reference
        updated[di] = {
          ...updated[di],
          isTransfer: true,
          matchedPairId: match.id,
          resolvedType: 'transfer',
          resolvedCategory: 'Transfer',
          resolvedDescription: `Transfer to ${match.bankType === 'natwest' ? 'NatWest' : 'Halifax'}`,
          resolvedAccountToId: updated[ci].resolvedAccountToId || updated[ci].resolvedAccountId,
        };
        updated[ci] = {
          ...updated[ci],
          isTransfer: true,
          matchedPairId: debit.id,
          resolvedType: 'transfer',
          resolvedCategory: 'Transfer',
          resolvedDescription: `Transfer from ${debit.bankType === 'halifax' ? 'Halifax' : 'NatWest'}`,
          resolvedAccountId: updated[di].resolvedAccountId || updated[di].resolvedAccountToId,
        };
      }
    }
  }
  return updated;
}

// ─────────────────────────────────────────────
// Create Rule Popup
// ─────────────────────────────────────────────
interface CreateRulePopupProps {
  row: RawRow;
  field: 'category' | 'description' | 'type' | 'notes';
  accounts: { id: string; name: string }[];
  categories: string[];
  currencySymbol: string;
  onConfirm: (rule: MerchantRule) => void;
  onDismiss: () => void;
}

const CreateRulePopup: React.FC<CreateRulePopupProps> = ({
  row, field, accounts, categories, currencySymbol, onConfirm, onDismiss
}) => {
  const [matchDescription, setMatchDescription] = useState(true);
  const [matchType,        setMatchType]        = useState(false);
  const [matchAmount,      setMatchAmount]       = useState(false);
  const [setDescription,   setSetDescription]   = useState(row.resolvedDescription || row.rawDescription);
  const [setCategory,      setSetCategory]      = useState(field === 'category' ? row.resolvedCategory : '');
  const [setType,          setSetType]          = useState<TransactionType | ''>(field === 'type' ? row.resolvedType : '');
  const [setAccountId,     setSetAccountId]     = useState(row.resolvedAccountId || '');
  const [setAccountToId,   setSetAccountToId]   = useState('');
  const [setNotes,         setSetNotes]         = useState(field === 'notes' ? row.resolvedNotes : '');

  const isIncome = row.rawAmount >= 0;

  const handleConfirm = () => {
    onConfirm({
      id: `mr-${Date.now()}`,
      matchDescription,
      matchType,
      matchAmount,
      contains:       row.rawDescription,
      setDescription,
      setCategory,
      setType,
      setAccountId,
      setAccountToId,
      setNotes,
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
            isIncome
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-magma border-magma/30 bg-magma/10'
          )}>
            {isIncome ? '+' : ''}{currencySymbol}{Math.abs(row.rawAmount).toFixed(2)}
            <span className={clsx('text-[9px] uppercase tracking-wider font-normal',
              isIncome ? 'text-emerald-500' : 'text-magma/70'
            )}>
              {isIncome ? 'income' : 'expense'}
            </span>
          </div>
          <button onClick={onDismiss} className="text-iron-dust hover:text-white shrink-0 mt-0.5"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Match when…</p>
            <div className="flex flex-wrap gap-2">
              <CheckRow label="Description contains" checked={matchDescription} onChange={setMatchDescription} />
              <CheckRow label="Type matches"          checked={matchType}        onChange={setMatchType} />
              <CheckRow label="Amount matches"        checked={matchAmount}      onChange={setMatchAmount} />
            </div>
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
                  <select value={setType} onChange={e => setSetType(e.target.value as TransactionType | '')}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— keep current —</option>
                    {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account From</label>
                  <select value={setAccountId} onChange={e => setSetAccountId(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— none —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account To (transfers / debt)</label>
                  <select value={setAccountToId} onChange={e => setSetAccountToId(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— none —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
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
          <button onClick={handleConfirm} disabled={!matchDescription && !matchType && !matchAmount}
            className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 transition-colors">
            Create Rule
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// SectionCard
// ─────────────────────────────────────────────
const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, defaultOpen = true, onSave, saving = false, saved = false, children }) => {
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
        {onSave && (
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border-l border-white/5 px-4 py-4 transition-colors disabled:opacity-50 hover:bg-white/[0.02]"
            style={{ color: saved ? '#34d399' : undefined }}>
            {saving
              ? <Loader2 size={11} className="animate-spin text-iron-dust" />
              : saved
                ? <CheckCircle2 size={11} />
                : <Save size={11} className="text-iron-dust" />}
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

// ─────────────────────────────────────────────
// Inline editable cell
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Assign CSVs to Account panel
// ─────────────────────────────────────────────
interface CsvAssignPanelProps {
  csvConfigs: CsvConfig[];
  onChange: (name: string, patch: Partial<CsvConfig>) => void;
  accounts: { id: string; name: string }[];
}

const CsvAssignPanel: React.FC<CsvAssignPanelProps> = ({ csvConfigs, onChange, accounts }) => {
  if (csvConfigs.length === 0) return null;
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-sm p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-[2px] text-white mb-1">Assign CSVs to Account</p>
      {csvConfigs.map(cfg => (
        <div key={cfg.csvName} className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-mono text-iron-dust bg-black/30 border border-white/10 px-2.5 py-1.5 rounded-sm shrink-0 max-w-[200px] truncate">
              {cfg.csvName}
            </span>
            <ArrowRight size={12} className="text-iron-dust shrink-0" />
            <select
              value={cfg.accountId}
              onChange={e => onChange(cfg.csvName, { accountId: e.target.value })}
              className="bg-black/30 border border-white/10 px-3 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none">
              <option value="">— select account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            <div className="flex items-center gap-1 ml-auto">
              <Columns2 size={12} className="text-iron-dust" />
              <span className="text-[10px] text-iron-dust font-mono">Amount cols:</span>
              <button
                onClick={() => onChange(cfg.csvName, { amountColumns: 1 })}
                className={clsx(
                  'px-2 py-1 text-[10px] font-mono border rounded-sm transition-colors',
                  cfg.amountColumns === 1
                    ? 'border-magma/50 bg-magma/10 text-white'
                    : 'border-white/10 text-iron-dust hover:border-white/20'
                )}>1</button>
              <button
                onClick={() => onChange(cfg.csvName, { amountColumns: 2 })}
                className={clsx(
                  'px-2 py-1 text-[10px] font-mono border rounded-sm transition-colors',
                  cfg.amountColumns === 2
                    ? 'border-magma/50 bg-magma/10 text-white'
                    : 'border-white/10 text-iron-dust hover:border-white/20'
                )}>2</button>
            </div>
          </div>

          {cfg.headers.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pl-1">
              {cfg.amountColumns === 1 ? (
                <>
                  <span className="text-[10px] text-iron-dust font-mono">Amount column:</span>
                  <select
                    value={cfg.amountCol}
                    onChange={e => onChange(cfg.csvName, { amountCol: e.target.value })}
                    className="bg-black/30 border border-white/10 px-2 py-1 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— select header —</option>
                    {cfg.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-iron-dust font-mono">Debit col:</span>
                  <select
                    value={cfg.debitCol}
                    onChange={e => onChange(cfg.csvName, { debitCol: e.target.value })}
                    className="bg-black/30 border border-white/10 px-2 py-1 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— select header —</option>
                    {cfg.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="text-[10px] text-iron-dust font-mono">Credit col:</span>
                  <select
                    value={cfg.creditCol}
                    onChange={e => onChange(cfg.csvName, { creditCol: e.target.value })}
                    className="bg-black/30 border border-white/10 px-2 py-1 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— select header —</option>
                    {cfg.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </>
              )}
            </div>
          )}

          {csvConfigs.length > 1 && <hr className="border-white/5" />}
        </div>
      ))}
      <p className="text-[10px] text-iron-dust/50 font-mono">(you can still override account per-row in the preview below)</p>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export const Categorize: React.FC = () => {
  const { data, addTransaction, currencySymbol } = useFinance();
  const {
    typeRules, setTypeRules,
    merchantRules, setMerchantRules,
    transferRules, setTransferRules,
    loading, saving, saved,
    saveTypeRules, saveMerchantRules, saveTransferRules,
  } = useImportRules();

  const [rows,          setRows]          = useState<RawRow[]>([]);
  const [importing,     setImporting]     = useState(false);
  const [importDone,    setImportDone]    = useState(false);
  const [importCount,   setImportCount]   = useState(0);
  const [activeTab,     setActiveTab]     = useState<'rules' | 'preview'>('rules');
  const [filterType,    setFilterType]    = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [rulePopup,     setRulePopup]     = useState<{ row: RawRow; field: 'category' | 'description' | 'type' | 'notes' } | null>(null);
  const [csvConfigs,    setCsvConfigs]    = useState<CsvConfig[]>([]);
  const [pendingCsvs,   setPendingCsvs]  = useState<{ name: string; text: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const allAccounts      = useMemo(() => [...data.assets, ...data.debts], [data.assets, data.debts]);
  const uniqueCategories = useMemo(() => Array.from(new Set(data.transactions.map(t => t.category))).sort(), [data.transactions]);
  const uniqueBankCodes  = useMemo(() => Array.from(new Set(rows.map(r => r.rawType))).filter(Boolean), [rows]);

  const visibleRows = useMemo(() => rows.filter(r => {
    if (filterType    !== 'all' && r.resolvedType      !== filterType)    return false;
    if (filterAccount !== 'all' && r.resolvedAccountId !== filterAccount) return false;
    return true;
  }), [rows, filterType, filterAccount]);

  const stats = useMemo(() => ({
    total:     rows.length,
    skipped:   rows.filter(r => r.skip).length,
    transfers: rows.filter(r => r.isTransfer).length,
    toImport:  rows.filter(r => !r.skip).length,
  }), [rows]);

  const buildInitialConfig = (name: string, text: string): CsvConfig => {
    const firstLine = text.split('\n').find(l => l.trim());
    const headers   = firstLine ? parseCSVLine(firstLine).map(h => h.replace(/'/g,'').trim()) : [];
    const hLower = headers.map(h => h.toLowerCase());
    const isHalifax = hLower.includes('sort code');
    return {
      csvName: name,
      accountId: '',
      amountColumns: isHalifax ? 2 : 1,
      amountCol: headers.find(h => ['value','amount'].includes(h.toLowerCase())) || '',
      debitCol:  headers.find(h => h.toLowerCase().includes('debit'))  || '',
      creditCol: headers.find(h => h.toLowerCase().includes('credit')) || '',
      headers,
    };
  };

  const rebuildRows = useCallback((csvs: { name: string; text: string }[], configs: CsvConfig[]) => {
    const allRows: RawRow[] = [];
    for (const csv of csvs) {
      const cfg = configs.find(c => c.csvName === csv.name) || null;
      let parsed = parseCSV(csv.text, csv.name, typeRules, cfg);
      parsed = applyMerchantRules(parsed, merchantRules);
      allRows.push(...parsed);
    }
    return applyTransferMatching(allRows, transferRules);
  }, [typeRules, merchantRules, transferRules]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    const newCsvs: { name: string; text: string }[] = [];
    let loaded = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        newCsvs.push({ name: file.name, text: e.target?.result as string });
        loaded++;
        if (loaded === files.length) {
          const newConfigs = newCsvs.map(c => buildInitialConfig(c.name, c.text));
          setPendingCsvs(newCsvs);
          setCsvConfigs(newConfigs);
          setRows(rebuildRows(newCsvs, newConfigs));
          setActiveTab('preview');
          setImportDone(false);
        }
      };
      reader.readAsText(file);
    });
  }, [rebuildRows]);

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
        const matchedRule   = typeRules.find(tr => tr.bankCode.toUpperCase() === r.rawType.toUpperCase());
        const resolvedType: TransactionType = matchedRule ? matchedRule.mapsTo : (r.rawAmount >= 0 ? 'income' : 'expense');
        return { ...r, resolvedType };
      });
      updated = applyMerchantRules(updated, merchantRules);
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
    const toImport = rows.filter(r => !r.skip && (r.resolvedAccountId || r.resolvedAccountToId));
    let count = 0;
    for (const row of toImport) {
      await addTransaction({
        date:        new Date(row.rawDate).toISOString(),
        description: row.resolvedDescription || row.rawDescription,
        amount:      row.rawAmount,
        type:        row.resolvedType,
        category:    row.resolvedCategory || 'General',
        accountId:   row.resolvedAccountId || row.resolvedAccountToId,
        notes:       row.resolvedNotes || undefined,
      });
      count++;
    }
    setImportCount(count);
    setImporting(false);
    setImportDone(true);
    setRows([]);
    setPendingCsvs([]);
    setCsvConfigs([]);
  };

  const addTypeRule    = () => setTypeRules(prev => [...prev, { id: `tr-${Date.now()}`, bankCode: '', mapsTo: 'expense' }]);
  const removeTypeRule = (id: string) => setTypeRules(prev => prev.filter(r => r.id !== id));
  const updateTypeRule = (id: string, patch: Partial<TypeMappingRule>) => setTypeRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const BLANK_MERCHANT: MerchantRule = { id: '', matchDescription: true, matchType: false, matchAmount: false, contains: '', setDescription: '', setCategory: '', setType: '', setAccountId: '', setAccountToId: '', setNotes: '' };
  const addMerchantRule    = () => setMerchantRules(prev => [...prev, { ...BLANK_MERCHANT, id: `mr-${Date.now()}` }]);
  const removeMerchantRule = (id: string) => setMerchantRules(prev => prev.filter(r => r.id !== id));
  const updateMerchantRule = (id: string, patch: Partial<MerchantRule>) => setMerchantRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addTransferRule    = () => setTransferRules(prev => [...prev, { id: `tfr-${Date.now()}`, label: '', fromDescContains: '', toDescContains: '', toleranceDays: 2 }]);
  const removeTransferRule = (id: string) => setTransferRules(prev => prev.filter(r => r.id !== id));
  const updateTransferRule = (id: string, patch: Partial<TransferRule>) => setTransferRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const handleRuleConfirm = (rule: MerchantRule) => {
    setMerchantRules(prev => [...prev, rule]);
    setRulePopup(null);
    setRows(prev => applyMerchantRules(prev, [...merchantRules, rule]));
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-iron-dust">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-xs font-mono">Loading rules…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-7xl mx-auto pb-24">

        <div className="mb-8">
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Tools</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">Categorize & Import</h1>
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

        {/* ══════════════════════ RULES TAB ══════════════════════ */}
        {activeTab === 'rules' && (
          <div className="space-y-4">

            <SectionCard
              title="Type Code → Transaction Type"
              subtitle="Map your bank's type codes (BAC, D/D, SO…) to Lithos types"
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
                    <select value={rule.mapsTo}
                      onChange={e => updateTypeRule(rule.id, { mapsTo: e.target.value as TransactionType })}
                      className="flex-1 bg-black/30 border border-white/10 px-2 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                      {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
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
              subtitle="Auto-set description, category, type, or accounts when a keyword is matched"
              icon={<Tag size={14} />}
              onSave={saveMerchantRules}
              saving={saving['merchant']}
              saved={saved['merchant']}>
              {merchantRules.length === 0 ? (
                <p className="text-iron-dust text-xs font-mono mb-2">No rules yet — add one or create from the preview table.</p>
              ) : (
                <div className="border border-white/10 rounded-sm overflow-hidden mb-3">
                  <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_2rem] gap-2 px-3 py-2 bg-[#0f1012] border-b border-white/10">
                    {['Contains', 'Set Description', 'Category', 'Type', 'Acct From', 'Acct To', ''].map((h, i) => (
                      <span key={i} className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {merchantRules.map(rule => (
                    <div key={rule.id} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_2rem] gap-2 items-center px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                      <input value={rule.contains}
                        onChange={e => updateMerchantRule(rule.id, { contains: e.target.value })}
                        placeholder="e.g. DENPLAN"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.setDescription}
                        onChange={e => updateMerchantRule(rule.id, { setDescription: e.target.value })}
                        placeholder="e.g. Denplan"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input list={`cats-${rule.id}`} value={rule.setCategory}
                        onChange={e => updateMerchantRule(rule.id, { setCategory: e.target.value })}
                        placeholder="e.g. Health"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <datalist id={`cats-${rule.id}`}>{uniqueCategories.map((c,i) => <option key={i} value={c} />)}</datalist>
                      <select value={rule.setType}
                        onChange={e => updateMerchantRule(rule.id, { setType: e.target.value as TransactionType | '' })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none">
                        <option value="">— keep —</option>
                        {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={rule.setAccountId}
                        onChange={e => updateMerchantRule(rule.id, { setAccountId: e.target.value })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none">
                        <option value="">— all —</option>
                        {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <select value={rule.setAccountToId}
                        onChange={e => updateMerchantRule(rule.id, { setAccountToId: e.target.value })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none">
                        <option value="">— none —</option>
                        {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button onClick={() => removeMerchantRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors flex items-center justify-center">
                        <Trash2 size={12} />
                      </button>
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
                    {['Label', 'Debit contains', 'Credit contains', '±Days', ''].map((h, i) => (
                      <span key={i} className="text-[9px] font-mono text-iron-dust uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {transferRules.map(rule => (
                    <div key={rule.id} className="grid grid-cols-[1.5fr_1fr_1fr_4rem_2rem] gap-3 items-center px-3 py-2.5 hover:bg-white/[0.02] transition-colors">
                      <input value={rule.label}
                        onChange={e => updateTransferRule(rule.id, { label: e.target.value })}
                        placeholder="e.g. Halifax → NatWest"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.fromDescContains}
                        onChange={e => updateTransferRule(rule.id, { fromDescContains: e.target.value })}
                        placeholder="e.g. CAMERON REES"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input value={rule.toDescContains}
                        onChange={e => updateTransferRule(rule.id, { toDescContains: e.target.value })}
                        placeholder="e.g. C REES"
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <input type="number" min={0} max={7} value={rule.toleranceDays}
                        onChange={e => updateTransferRule(rule.id, { toleranceDays: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none font-mono" />
                      <button onClick={() => removeTransferRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors flex items-center justify-center">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addTransferRule} className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white transition-colors">
                <Plus size={13} /><span>Add Rule</span>
              </button>
            </SectionCard>

            <SectionCard title="Upload Bank CSV(s)" subtitle="Drop one or more files — NatWest & Halifax auto-detected" icon={<Upload size={14} />}>
              <div
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-magma/50 rounded-sm p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors group">
                <Upload size={28} className="text-iron-dust group-hover:text-magma transition-colors" />
                <p className="text-sm text-iron-dust">Drop CSV files here or click to browse</p>
                <p className="text-xs text-iron-dust/50 font-mono">NatWest · Halifax · Generic CSV</p>
                <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </div>
            </SectionCard>

          </div>
        )}

        {/* ══════════════════════ PREVIEW TAB ══════════════════════ */}
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
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Rows',  value: stats.total,     color: 'text-white' },
                    { label: 'To Import',   value: stats.toImport,  color: 'text-emerald-400' },
                    { label: 'Transfers',   value: stats.transfers, color: 'text-blue-400' },
                    { label: 'Skipped',     value: stats.skipped,   color: 'text-iron-dust' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#131517] border border-white/10 rounded-sm p-4">
                      <div className={clsx('text-2xl font-bold font-mono', s.color)}>{s.value}</div>
                      <div className="text-[10px] text-iron-dust uppercase tracking-wider mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                <CsvAssignPanel
                  csvConfigs={csvConfigs}
                  onChange={updateCsvConfig}
                  accounts={allAccounts}
                />

                {uniqueBankCodes.length > 0 && (
                  <div className="bg-[#131517] border border-white/10 rounded-sm p-4">
                    <p className="text-xs font-bold uppercase tracking-[2px] text-white mb-3">Bulk Override by Bank Code</p>
                    <div className="flex flex-wrap gap-3">
                      {uniqueBankCodes.map(code => (
                        <div key={code} className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-black/40 border border-white/10 px-2 py-1 rounded-sm text-iron-dust">{code}</span>
                          <ArrowRight size={10} className="text-iron-dust" />
                          <select onChange={e => bulkSetType(code, e.target.value as TransactionType)} defaultValue=""
                            className="bg-black/30 border border-white/10 px-2 py-1 text-xs text-white rounded-sm focus:border-magma outline-none">
                            <option value="" disabled>bulk set…</option>
                            {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Filter size={12} className="text-iron-dust" />
                  <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="all">All Types</option>
                    {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
                    className="bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="all">All Accounts</option>
                    {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <span className="text-xs text-iron-dust font-mono ml-auto">{visibleRows.length} rows shown</span>
                  <button onClick={reapplyRules}
                    className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-sm transition-colors">
                    <RefreshCcw size={11} /><span>Re-apply Rules</span>
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
                        {visibleRows.map((row, idx) => (
                          <tr key={row.id}
                            className={clsx(
                              'border-b border-white/5 transition-colors',
                              row.skip       ? 'opacity-30 bg-black/20' :
                              row.isTransfer ? 'bg-blue-500/5 hover:bg-blue-500/10' :
                              idx % 2 === 0  ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-white/[0.01] hover:bg-white/[0.03]'
                            )}>
                            <td className="px-3 py-2 text-iron-dust/40 font-mono text-[10px]">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-iron-dust text-[11px] whitespace-nowrap">{row.rawDate}</td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 rounded-sm font-mono text-[10px] text-iron-dust">{row.rawType}</span>
                            </td>
                            <td className="px-3 py-2 max-w-[220px]">
                              <EditableCell value={row.resolvedDescription} onSave={v => updateRow(row.id, { resolvedDescription: v })}
                                className="text-white text-[11px]" showRulePrompt onCreateRule={() => setRulePopup({ row, field: 'description' })} />
                              {row.isTransfer && <span className="text-[9px] font-mono text-blue-400 block mt-0.5">↔ transfer match</span>}
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
                            {/* Acct From — source, highlighted if empty on an expense */}
                            <td className="px-3 py-2">
                              <select value={row.resolvedAccountId} onChange={e => updateRow(row.id, { resolvedAccountId: e.target.value })}
                                className={clsx('bg-black/30 border px-2 py-1 text-[11px] text-white rounded-sm focus:border-magma outline-none',
                                  !row.resolvedAccountId && row.rawAmount < 0 ? 'border-magma/40 text-magma/70' : 'border-white/10'
                                )}>
                                <option value="">— assign —</option>
                                <optgroup label="Assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                                <optgroup label="Debts">{data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                              </select>
                            </td>
                            {/* Acct To — destination, highlighted if empty on an income */}
                            <td className="px-3 py-2">
                              <select value={row.resolvedAccountToId} onChange={e => updateRow(row.id, { resolvedAccountToId: e.target.value })}
                                className={clsx('bg-black/30 border px-2 py-1 text-[11px] text-white rounded-sm focus:border-magma outline-none',
                                  !row.resolvedAccountToId && row.rawAmount >= 0 && row.resolvedType !== 'expense'
                                    ? 'border-magma/40 text-magma/70'
                                    : 'border-white/10'
                                )}>
                                <option value="">— assign —</option>
                                <optgroup label="Assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                                <optgroup label="Debts">{data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                              </select>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#131517] border border-white/10 rounded-sm p-4">
                  <div>
                    <p className="text-sm font-bold text-white">{stats.toImport} transactions ready to import</p>
                    {rows.some(r => !r.skip && !r.resolvedAccountId && !r.resolvedAccountToId) && (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle size={11} /> Some rows have no account assigned and will be skipped.
                      </p>
                    )}
                  </div>
                  <button onClick={handleImport} disabled={importing || stats.toImport === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {importing
                      ? <><div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Importing…</span></>
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
          categories={uniqueCategories}
          currencySymbol={currencySymbol}
          onConfirm={handleRuleConfirm}
          onDismiss={() => setRulePopup(null)}
        />
      )}
    </div>
  );
};
