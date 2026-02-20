import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Upload, Plus, Trash2, Save, ChevronDown, ChevronUp,
  ArrowRight, Tag, Shuffle, TableProperties, RefreshCcw,
  CheckCircle2, AlertCircle, X, Edit2, Check, Filter
} from 'lucide-react';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { TransactionType } from '../data/mockData';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type BankType = 'natwest' | 'halifax' | 'generic';

interface RawRow {
  id: string;
  rawDate: string;
  rawType: string;
  rawDescription: string;
  rawAmount: number; // positive = credit, negative = debit
  balance?: number;
  bankType: BankType;
  // resolved fields (editable by user)
  resolvedType: TransactionType;
  resolvedDescription: string;
  resolvedCategory: string;
  resolvedAccountId: string;
  resolvedNotes: string;
  matchedPairId?: string; // id of the matching transfer row
  isTransfer: boolean;
  skip: boolean;
}

interface TypeMappingRule {
  id: string;
  bankCode: string; // e.g. 'BAC', 'D/D'
  mapsTo: TransactionType;
}

interface MerchantRule {
  id: string;
  contains: string;     // substring match on description
  setDescription: string;
  setCategory: string;
  setType: TransactionType | '';
}

interface TransferRule {
  id: string;
  label: string;
  fromDescContains: string; // debit side pattern (e.g. 'CAMERON REES')
  toDescContains: string;   // credit side pattern (e.g. 'C REES , SAVINGS')
  toleranceDays: number;
}

const TX_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'debt_payment', 'investing'];

const DEFAULT_NATWEST_TYPES: TypeMappingRule[] = [
  { id: 'nw1', bankCode: 'BAC', mapsTo: 'income' },
  { id: 'nw2', bankCode: 'D/D', mapsTo: 'expense' },
  { id: 'nw3', bankCode: 'S/O', mapsTo: 'expense' },
  { id: 'nw4', bankCode: 'CHG', mapsTo: 'expense' },
];

const DEFAULT_HALIFAX_TYPES: TypeMappingRule[] = [
  { id: 'hx1', bankCode: 'DEB', mapsTo: 'expense' },
  { id: 'hx2', bankCode: 'FPI', mapsTo: 'income' },
  { id: 'hx3', bankCode: 'FPO', mapsTo: 'expense' },
  { id: 'hx4', bankCode: 'DD',  mapsTo: 'expense' },
  { id: 'hx5', bankCode: 'SO',  mapsTo: 'expense' },
  { id: 'hx6', bankCode: 'BGC', mapsTo: 'income' },
  { id: 'hx7', bankCode: 'TFR', mapsTo: 'transfer' },
];

const DEFAULT_TRANSFER_RULES: TransferRule[] = [
  {
    id: 'tr1',
    label: 'Halifax → NatWest (weekly savings)',
    fromDescContains: 'CAMERON REES',
    toDescContains: 'C REES',
    toleranceDays: 2,
  },
];

// ─────────────────────────────────────────────
// Parse helpers
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
  if (h.includes('sort code')) return 'halifax';
  return 'generic';
}

function parseNatwestDate(raw: string): string {
  // "13 Feb 2026" -> ISO
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const parts = raw.trim().split(' ');
  if (parts.length === 3) {
    const m = months[parts[1].toLowerCase()] || '01';
    return `${parts[2]}-${m}-${parts[0].padStart(2, '0')}`;
  }
  return raw;
}

function parseHalifaxDate(raw: string): string {
  // "30/09/2025" -> "2025-09-30"
  const parts = raw.trim().split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return raw;
}

function parseCSV(text: string, typeRules: TypeMappingRule[]): RawRow[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/'/g, '').trim());
  const bankType = detectBankType(headers);

  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.every(c => !c)) continue;

    const get = (name: string) => {
      const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      return idx >= 0 ? (cells[idx] || '').trim() : '';
    };

    let rawDate = '';
    let rawType = '';
    let rawDescription = '';
    let rawAmount = 0;
    let balance: number | undefined;

    if (bankType === 'natwest') {
      rawDate = parseNatwestDate(get('Date'));
      rawType = get('Type');
      rawDescription = get('Description');
      const val = parseFloat(get('Value'));
      rawAmount = isNaN(val) ? 0 : val;
      const bal = parseFloat(get('Balance'));
      balance = isNaN(bal) ? undefined : bal;
    } else if (bankType === 'halifax') {
      rawDate = parseHalifaxDate(get('Transaction Date'));
      rawType = get('Transaction Type');
      rawDescription = get('Transaction Description');
      const debit  = parseFloat(get('Debit Amount'))  || 0;
      const credit = parseFloat(get('Credit Amount')) || 0;
      rawAmount = credit > 0 ? credit : -debit;
      const bal = parseFloat(get('Balance'));
      balance = isNaN(bal) ? undefined : bal;
    } else {
      rawDate = get('date') || get('Date');
      rawType = get('type') || get('Type');
      rawDescription = get('description') || get('Description');
      rawAmount = parseFloat(get('amount') || get('Amount')) || 0;
    }

    // Apply type mapping rules
    const matchedRule = typeRules.find(r => r.bankCode.toUpperCase() === rawType.toUpperCase());
    let resolvedType: TransactionType = rawAmount >= 0 ? 'income' : 'expense';
    if (matchedRule) resolvedType = matchedRule.mapsTo;

    rows.push({
      id: `row-${i}-${Date.now()}`,
      rawDate,
      rawType,
      rawDescription,
      rawAmount,
      balance,
      bankType,
      resolvedType,
      resolvedDescription: rawDescription,
      resolvedCategory: '',
      resolvedAccountId: '',
      resolvedNotes: '',
      isTransfer: false,
      skip: false,
    });
  }

  return rows;
}

function applyMerchantRules(rows: RawRow[], rules: MerchantRule[]): RawRow[] {
  return rows.map(row => {
    let r = { ...row };
    for (const rule of rules) {
      if (!rule.contains) continue;
      if (r.rawDescription.toLowerCase().includes(rule.contains.toLowerCase())) {
        if (rule.setDescription) r.resolvedDescription = rule.setDescription;
        if (rule.setCategory)    r.resolvedCategory    = rule.setCategory;
        if (rule.setType)        r.resolvedType        = rule.setType as TransactionType;
        break; // first matching rule wins
      }
    }
    return r;
  });
}

function applyTransferMatching(rows: RawRow[], rules: TransferRule[]): RawRow[] {
  const updated = rows.map(r => ({ ...r, isTransfer: false, matchedPairId: undefined }));

  for (const rule of rules) {
    // Debit rows (outflows) that match fromDescContains
    const debits = updated.filter(r =>
      r.rawAmount < 0 &&
      r.rawDescription.toUpperCase().includes(rule.fromDescContains.toUpperCase())
    );
    // Credit rows (inflows) that match toDescContains
    const credits = updated.filter(r =>
      r.rawAmount > 0 &&
      r.rawDescription.toUpperCase().includes(rule.toDescContains.toUpperCase())
    );

    for (const debit of debits) {
      const debitDate = new Date(debit.rawDate).getTime();
      const match = credits.find(credit => {
        if (credit.matchedPairId) return false; // already matched
        const creditDate = new Date(credit.rawDate).getTime();
        const daysDiff = Math.abs(debitDate - creditDate) / (1000 * 60 * 60 * 24);
        const amountMatch = Math.abs(Math.abs(credit.rawAmount) - Math.abs(debit.rawAmount)) < 0.02;
        return amountMatch && daysDiff <= rule.toleranceDays;
      });

      if (match) {
        const debitIdx  = updated.findIndex(r => r.id === debit.id);
        const creditIdx = updated.findIndex(r => r.id === match.id);
        updated[debitIdx]  = { ...updated[debitIdx],  isTransfer: true, matchedPairId: match.id,  resolvedType: 'transfer', resolvedCategory: 'Transfer', resolvedDescription: `Transfer to ${match.bankType === 'natwest' ? 'NatWest' : 'Halifax'}` };
        updated[creditIdx] = { ...updated[creditIdx], isTransfer: true, matchedPairId: debit.id, resolvedType: 'transfer', resolvedCategory: 'Transfer', resolvedDescription: `Transfer from ${debit.bankType === 'halifax' ? 'Halifax' : 'NatWest'}` };
      }
    }
  }
  return updated;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; subtitle?: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, subtitle, icon, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-sm bg-[#131517] overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-5 py-4 bg-[#0f1012] hover:bg-[#131517] transition-colors text-left">
        <span className="text-magma">{icon}</span>
        <div className="flex-1">
          <span className="text-xs font-bold uppercase tracking-[2px] text-white block">{title}</span>
          {subtitle && <span className="text-[10px] text-iron-dust font-mono">{subtitle}</span>}
        </div>
        {open ? <ChevronUp size={14} className="text-iron-dust" /> : <ChevronDown size={14} className="text-iron-dust" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
};

// Inline editable cell
const EditableCell: React.FC<{ value: string; onSave: (v: string) => void; className?: string; type?: 'text' | 'select'; options?: string[] }> = ({ value, onSave, className, type = 'text', options = [] }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => { onSave(draft); setEditing(false); };
  if (editing) {
    if (type === 'select') return (
      <select value={draft} onChange={e => { setDraft(e.target.value); onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        autoFocus
        className="bg-black border border-magma/50 text-white text-xs px-1 py-0.5 rounded-sm outline-none w-full">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className={clsx('bg-black border border-magma/50 text-white text-xs px-1 py-0.5 rounded-sm outline-none w-full', className)} />
    );
  }
  return (
    <span onClick={() => { setDraft(value); setEditing(true); }}
      className={clsx('cursor-pointer hover:text-white hover:underline underline-offset-2 decoration-dotted transition-colors', className)}>
      {value || <span className="text-white/20 italic text-[10px]">click to edit</span>}
    </span>
  );
};

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export const Categorize: React.FC = () => {
  const { data, addTransaction, currencySymbol } = useFinance();

  // ── State ──
  const [typeRules, setTypeRules]         = useState<TypeMappingRule[]>([...DEFAULT_NATWEST_TYPES, ...DEFAULT_HALIFAX_TYPES]);
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([]);
  const [transferRules, setTransferRules] = useState<TransferRule[]>(DEFAULT_TRANSFER_RULES);
  const [rows, setRows]                   = useState<RawRow[]>([]);
  const [importing, setImporting]         = useState(false);
  const [importDone, setImportDone]       = useState(false);
  const [importCount, setImportCount]     = useState(0);
  const [activeTab, setActiveTab]         = useState<'rules' | 'preview'>('rules');
  const [filterType, setFilterType]       = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Derived ──
  const allAccounts = useMemo(() => [...data.assets, ...data.debts], [data.assets, data.debts]);
  const uniqueCategories = useMemo(() => Array.from(new Set(data.transactions.map(t => t.category))).sort(), [data.transactions]);

  const visibleRows = useMemo(() => {
    return rows.filter(r => {
      if (filterType !== 'all' && r.resolvedType !== filterType) return false;
      if (filterAccount !== 'all' && r.resolvedAccountId !== filterAccount) return false;
      return true;
    });
  }, [rows, filterType, filterAccount]);

  const stats = useMemo(() => ({
    total:     rows.length,
    skipped:   rows.filter(r => r.skip).length,
    transfers: rows.filter(r => r.isTransfer).length,
    toImport:  rows.filter(r => !r.skip).length,
  }), [rows]);

  // ── File upload ──
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    const allRows: RawRow[] = [];
    let loaded = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string;
        let parsed = parseCSV(text, typeRules);
        parsed = applyMerchantRules(parsed, merchantRules);
        parsed = applyTransferMatching(parsed, transferRules);
        allRows.push(...parsed);
        loaded++;
        if (loaded === files.length) {
          // Merge and re-apply transfer matching across all files
          let merged = allRows;
          merged = applyTransferMatching(merged, transferRules);
          setRows(merged);
          setActiveTab('preview');
          setImportDone(false);
        }
      };
      reader.readAsText(file);
    });
  }, [typeRules, merchantRules, transferRules]);

  // ── Reapply rules (after editing rules) ──
  const reapplyRules = useCallback(() => {
    setRows(prev => {
      let updated = prev.map(r => {
        const matchedRule = typeRules.find(tr => tr.bankCode.toUpperCase() === r.rawType.toUpperCase());
        const resolvedType: TransactionType = matchedRule ? matchedRule.mapsTo : (r.rawAmount >= 0 ? 'income' : 'expense');
        return { ...r, resolvedType };
      });
      updated = applyMerchantRules(updated, merchantRules);
      updated = applyTransferMatching(updated, transferRules);
      return updated;
    });
  }, [typeRules, merchantRules, transferRules]);

  // ── Row update ──
  const updateRow = (id: string, patch: Partial<RawRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  // ── Bulk type change ──
  const bulkSetType = (bankCode: string, newType: TransactionType) => {
    setRows(prev => prev.map(r => r.rawType.toUpperCase() === bankCode.toUpperCase() ? { ...r, resolvedType: newType } : r));
  };

  // ── Import ──
  const handleImport = async () => {
    setImporting(true);
    const toImport = rows.filter(r => !r.skip && r.resolvedAccountId);
    let count = 0;
    for (const row of toImport) {
      await addTransaction({
        date: new Date(row.rawDate).toISOString(),
        description: row.resolvedDescription || row.rawDescription,
        amount: row.rawAmount,
        type: row.resolvedType,
        category: row.resolvedCategory || 'General',
        accountId: row.resolvedAccountId,
        notes: row.resolvedNotes || undefined,
      });
      count++;
    }
    setImportCount(count);
    setImporting(false);
    setImportDone(true);
    setRows([]);
  };

  // ── Type mapping rule helpers ──
  const addTypeRule = () => setTypeRules(prev => [...prev, { id: `tr-${Date.now()}`, bankCode: '', mapsTo: 'expense' }]);
  const removeTypeRule = (id: string) => setTypeRules(prev => prev.filter(r => r.id !== id));
  const updateTypeRule = (id: string, patch: Partial<TypeMappingRule>) => setTypeRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addMerchantRule = () => setMerchantRules(prev => [...prev, { id: `mr-${Date.now()}`, contains: '', setDescription: '', setCategory: '', setType: '' }]);
  const removeMerchantRule = (id: string) => setMerchantRules(prev => prev.filter(r => r.id !== id));
  const updateMerchantRule = (id: string, patch: Partial<MerchantRule>) => setMerchantRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  const addTransferRule = () => setTransferRules(prev => [...prev, { id: `tfr-${Date.now()}`, label: '', fromDescContains: '', toDescContains: '', toleranceDays: 2 }]);
  const removeTransferRule = (id: string) => setTransferRules(prev => prev.filter(r => r.id !== id));
  const updateTransferRule = (id: string, patch: Partial<TransferRule>) => setTransferRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  // ── Unique bank codes in current rows ──
  const uniqueBankCodes = useMemo(() => Array.from(new Set(rows.map(r => r.rawType))).filter(Boolean), [rows]);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-8 max-w-7xl mx-auto pb-24">

        {/* Header */}
        <div className="mb-8">
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Tools</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">Categorize & Import</h1>
          <p className="text-iron-dust text-sm mt-2">Set rules for cleaning bank CSVs, match transfers, then import in bulk.</p>
        </div>

        {/* Tab bar */}
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

        {/* ══════════════════════════════════════ */}
        {/* TAB: RULES */}
        {/* ══════════════════════════════════════ */}
        {activeTab === 'rules' && (
          <div className="space-y-4">

            {/* Type Mapping */}
            <SectionCard title="Type Code → Transaction Type" subtitle="Map your bank's type codes (BAC, D/D, SO…) to Lithos types" icon={<Shuffle size={14} />}>
              <div className="space-y-2">
                {typeRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3">
                    <input value={rule.bankCode} onChange={e => updateTypeRule(rule.id, { bankCode: e.target.value })}
                      placeholder="e.g. BAC" className="w-28 bg-black/30 border border-white/10 px-3 py-2 text-xs font-mono text-white rounded-sm focus:border-magma outline-none uppercase" />
                    <ArrowRight size={12} className="text-iron-dust shrink-0" />
                    <select value={rule.mapsTo} onChange={e => updateTypeRule(rule.id, { mapsTo: e.target.value as TransactionType })}
                      className="flex-1 bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                      {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => removeTypeRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={addTypeRule} className="mt-2 flex items-center gap-2 text-xs text-iron-dust hover:text-white transition-colors">
                  <Plus size={13} /><span>Add Rule</span>
                </button>
              </div>
            </SectionCard>

            {/* Merchant / Description Rules */}
            <SectionCard title="Description Cleanup Rules" subtitle="Auto-set merchant name, category, or type when description contains a keyword" icon={<Tag size={14} />}>
              {merchantRules.length === 0 && (
                <p className="text-iron-dust text-xs font-mono mb-3">No rules yet. Add a rule to auto-categorise transactions by description.</p>
              )}
              <div className="space-y-3">
                {merchantRules.map(rule => (
                  <div key={rule.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-white/[0.02] border border-white/5 rounded-sm p-3">
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Description Contains</label>
                      <input value={rule.contains} onChange={e => updateMerchantRule(rule.id, { contains: e.target.value })}
                        placeholder="e.g. AMAZON" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Set Description</label>
                      <input value={rule.setDescription} onChange={e => updateMerchantRule(rule.id, { setDescription: e.target.value })}
                        placeholder="e.g. Amazon" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Set Category</label>
                      <input list="cats-list" value={rule.setCategory} onChange={e => updateMerchantRule(rule.id, { setCategory: e.target.value })}
                        placeholder="e.g. Shopping" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                      <datalist id="cats-list">{uniqueCategories.map((c, i) => <option key={i} value={c} />)}</datalist>
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Set Type</label>
                      <select value={rule.setType} onChange={e => updateMerchantRule(rule.id, { setType: e.target.value as TransactionType | '' })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none">
                        <option value="">— keep —</option>
                        {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <button onClick={() => removeMerchantRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors mt-4"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={addMerchantRule} className="flex items-center gap-2 text-xs text-iron-dust hover:text-white transition-colors">
                  <Plus size={13} /><span>Add Rule</span>
                </button>
              </div>
            </SectionCard>

            {/* Transfer Matching Rules */}
            <SectionCard title="Transfer Matching Rules" subtitle="Automatically link debits and credits as internal transfers by description pattern + amount + date tolerance" icon={<ArrowRight size={14} />}>
              <div className="space-y-3">
                {transferRules.map(rule => (
                  <div key={rule.id} className="grid grid-cols-[1.5fr_1fr_1fr_auto_auto] gap-3 items-end bg-white/[0.02] border border-white/5 rounded-sm p-3">
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Label</label>
                      <input value={rule.label} onChange={e => updateTransferRule(rule.id, { label: e.target.value })}
                        placeholder="e.g. Halifax → NatWest Savings" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Debit Desc Contains</label>
                      <input value={rule.fromDescContains} onChange={e => updateTransferRule(rule.id, { fromDescContains: e.target.value })}
                        placeholder="e.g. CAMERON REES" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Credit Desc Contains</label>
                      <input value={rule.toDescContains} onChange={e => updateTransferRule(rule.id, { toDescContains: e.target.value })}
                        placeholder="e.g. C REES" className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none" />
                    </div>
                    <div className="w-20">
                      <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">±Days</label>
                      <input type="number" min={0} max={7} value={rule.toleranceDays} onChange={e => updateTransferRule(rule.id, { toleranceDays: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black/30 border border-white/10 px-2 py-1.5 text-xs text-white rounded-sm focus:border-magma outline-none font-mono" />
                    </div>
                    <button onClick={() => removeTransferRule(rule.id)} className="text-iron-dust hover:text-magma transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={addTransferRule} className="flex items-center gap-2 text-xs text-iron-dust hover:text-white transition-colors">
                  <Plus size={13} /><span>Add Rule</span>
                </button>
              </div>
            </SectionCard>

            {/* Upload */}
            <SectionCard title="Upload Bank CSV(s)" subtitle="Drop one or more bank export files — NatWest and Halifax formats auto-detected" icon={<Upload size={14} />}>
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

        {/* ══════════════════════════════════════ */}
        {/* TAB: PREVIEW */}
        {/* ══════════════════════════════════════ */}
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
                <p className="text-sm font-mono">No data loaded yet. Go to Rules &amp; Config and upload a CSV.</p>
              </div>
            )}

            {rows.length > 0 && (
              <>
                {/* Stats bar */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Rows',    value: stats.total,     color: 'text-white' },
                    { label: 'To Import',     value: stats.toImport,  color: 'text-emerald-400' },
                    { label: 'Transfers',     value: stats.transfers, color: 'text-blue-400' },
                    { label: 'Skipped',       value: stats.skipped,   color: 'text-iron-dust' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#131517] border border-white/10 rounded-sm p-4">
                      <div className={clsx('text-2xl font-bold font-mono', s.color)}>{s.value}</div>
                      <div className="text-[10px] text-iron-dust uppercase tracking-wider mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Bulk type override by bank code */}
                {uniqueBankCodes.length > 0 && (
                  <div className="bg-[#131517] border border-white/10 rounded-sm p-4">
                    <p className="text-xs font-bold uppercase tracking-[2px] text-white mb-3">Bulk Override by Bank Code</p>
                    <div className="flex flex-wrap gap-3">
                      {uniqueBankCodes.map(code => (
                        <div key={code} className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-black/40 border border-white/10 px-2 py-1 rounded-sm text-iron-dust">{code}</span>
                          <ArrowRight size={10} className="text-iron-dust" />
                          <select onChange={e => bulkSetType(code, e.target.value as TransactionType)}
                            defaultValue=""
                            className="bg-black/30 border border-white/10 px-2 py-1 text-xs text-white rounded-sm focus:border-magma outline-none">
                            <option value="" disabled>bulk set…</option>
                            {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filters */}
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
                  <button onClick={reapplyRules} className="flex items-center gap-1.5 text-xs text-iron-dust hover:text-white border border-white/10 hover:border-white/20 px-3 py-2 rounded-sm transition-colors">
                    <RefreshCcw size={11} /><span>Re-apply Rules</span>
                  </button>
                </div>

                {/* Assign all to account shortcut */}
                <div className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-sm p-3">
                  <span className="text-xs text-iron-dust font-mono">Assign all rows to account:</span>
                  <select onChange={e => {
                    if (!e.target.value) return;
                    setRows(prev => prev.map(r => ({ ...r, resolvedAccountId: e.target.value })));
                  }} defaultValue=""
                    className="bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">Select account…</option>
                    {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <span className="text-[10px] text-iron-dust/50">(you can still override per-row)</span>
                </div>

                {/* Table */}
                <div className="border border-white/10 rounded-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#0f1012] border-b border-white/10">
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider w-8">
                            <input type="checkbox" onChange={e => setRows(prev => prev.map(r => ({ ...r, skip: e.target.checked })))}
                              className="accent-magma" />
                          </th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Date</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Bank Code</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider min-w-[160px]">Description</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Category</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Type</th>
                          <th className="px-3 py-3 text-left font-mono text-iron-dust uppercase tracking-wider">Account</th>
                          <th className="px-3 py-3 text-right font-mono text-iron-dust uppercase tracking-wider">Amount</th>
                          <th className="px-3 py-3 text-center font-mono text-iron-dust uppercase tracking-wider">Skip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row, idx) => (
                          <tr key={row.id}
                            className={clsx(
                              'border-b border-white/5 transition-colors',
                              row.skip          ? 'opacity-30 bg-black/20' :
                              row.isTransfer    ? 'bg-blue-500/5 hover:bg-blue-500/10' :
                              idx % 2 === 0     ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-white/[0.01] hover:bg-white/[0.03]'
                            )}>
                            {/* Row index */}
                            <td className="px-3 py-2 text-iron-dust/40 font-mono text-[10px]">{idx + 1}</td>

                            {/* Date */}
                            <td className="px-3 py-2 font-mono text-iron-dust text-[11px] whitespace-nowrap">{row.rawDate}</td>

                            {/* Bank Code */}
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 rounded-sm font-mono text-[10px] text-iron-dust">{row.rawType}</span>
                            </td>

                            {/* Description */}
                            <td className="px-3 py-2 max-w-[220px]">
                              <EditableCell
                                value={row.resolvedDescription}
                                onSave={v => updateRow(row.id, { resolvedDescription: v })}
                                className="text-white text-[11px]"
                              />
                              {row.isTransfer && (
                                <span className="text-[9px] font-mono text-blue-400 block mt-0.5">↔ transfer match</span>
                              )}
                            </td>

                            {/* Category */}
                            <td className="px-3 py-2">
                              <EditableCell
                                value={row.resolvedCategory}
                                onSave={v => updateRow(row.id, { resolvedCategory: v })}
                                className="text-iron-dust text-[11px]"
                              />
                            </td>

                            {/* Type */}
                            <td className="px-3 py-2">
                              <EditableCell
                                value={row.resolvedType}
                                onSave={v => updateRow(row.id, { resolvedType: v as TransactionType })}
                                type="select"
                                options={TX_TYPES}
                                className={clsx('font-mono text-[10px] px-1.5 py-0.5 rounded-sm border',
                                  row.resolvedType === 'income'       ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' :
                                  row.resolvedType === 'expense'      ? 'text-magma border-magma/20 bg-magma/10' :
                                  row.resolvedType === 'transfer'     ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
                                  row.resolvedType === 'debt_payment' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' :
                                  'text-purple-400 border-purple-400/20 bg-purple-400/10'
                                )}
                              />
                            </td>

                            {/* Account */}
                            <td className="px-3 py-2">
                              <select value={row.resolvedAccountId} onChange={e => updateRow(row.id, { resolvedAccountId: e.target.value })}
                                className={clsx('bg-black/30 border px-2 py-1 text-[11px] text-white rounded-sm focus:border-magma outline-none',
                                  !row.resolvedAccountId ? 'border-magma/40 text-magma/70' : 'border-white/10'
                                )}>
                                <option value="">— assign —</option>
                                <optgroup label="Assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                                <optgroup label="Debts">{data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                              </select>
                            </td>

                            {/* Amount */}
                            <td className={clsx('px-3 py-2 text-right font-mono font-bold text-[11px]',
                              row.rawAmount >= 0 ? 'text-emerald-400' : 'text-magma'
                            )}>
                              {row.rawAmount >= 0 ? '+' : ''}{currencySymbol}{Math.abs(row.rawAmount).toFixed(2)}
                            </td>

                            {/* Skip */}
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => updateRow(row.id, { skip: !row.skip })}
                                className={clsx('w-5 h-5 rounded-sm border flex items-center justify-center mx-auto transition-colors',
                                  row.skip ? 'bg-white/10 border-white/20 text-iron-dust' : 'border-white/10 text-transparent hover:border-white/30'
                                )}>
                                <X size={10} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Import button */}
                <div className="flex items-center justify-between bg-[#131517] border border-white/10 rounded-sm p-4">
                  <div>
                    <p className="text-sm font-bold text-white">{stats.toImport} transactions ready to import</p>
                    {rows.some(r => !r.skip && !r.resolvedAccountId) && (
                      <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1">
                        <AlertCircle size={11} /> Some rows have no account assigned and will be skipped.
                      </p>
                    )}
                  </div>
                  <button onClick={handleImport} disabled={importing || stats.toImport === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {importing ? (
                      <><div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Importing…</span></>
                    ) : (
                      <><Save size={13} /><span>Import {stats.toImport} Transactions</span></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
