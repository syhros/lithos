import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Plus, Upload, Trash2, CheckSquare, Square, X, Edit2 } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { CSVImportModal } from '../components/CSVImportModal';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { SmartSearchBar } from '../components/SmartSearchBar';
import { useSmartSearch } from '../hooks/useSmartSearch';
import { Transaction } from '../data/mockData';

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

const TYPE_LABELS: Record<string, string> = {
  income:       'Income',
  expense:      'Expense',
  investing:    'Investing',
  transfer:     'Transfer',
  debt_payment: 'Debt Payment',
};

const TYPE_COLORS: Record<string, string> = {
  income:       'text-emerald-vein bg-emerald-vein/10 border-emerald-vein/20',
  expense:      'text-magma bg-magma/10 border-magma/20',
  investing:    'text-blue-400 bg-blue-400/10 border-blue-400/20',
  transfer:     'text-iron-dust bg-white/5 border-white/10',
  debt_payment: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
};

const getDisplayAmount = (tx: Transaction): { value: number; prefix: string; colorClass: string } => {
  const abs = Math.abs(tx.amount);
  switch (tx.type) {
    case 'income':       return { value: abs, prefix: '+', colorClass: 'text-emerald-vein' };
    case 'expense':      return { value: abs, prefix: '-', colorClass: 'text-white' };
    case 'investing': {
      const cat = (tx.category || '').toLowerCase();
      if (cat === 'sell' || cat === 'dividend') return { value: abs, prefix: '+', colorClass: 'text-emerald-vein' };
      return { value: abs, prefix: '', colorClass: 'text-white' };
    }
    case 'debt_payment': return { value: abs, prefix: '-', colorClass: 'text-white' };
    case 'transfer':
      if (tx.amount > 0) return { value: abs, prefix: '+', colorClass: 'text-emerald-vein' };
      return { value: abs, prefix: '-', colorClass: 'text-white' };
    default:
      if (tx.amount > 0) return { value: abs, prefix: '+', colorClass: 'text-emerald-vein' };
      return { value: abs, prefix: '-', colorClass: 'text-white' };
  }
};

// ─── Bulk Edit Modal ──────────────────────────────────────────────────────────
interface BulkEditFields {
  accountId?: string;
  type?: string;
  category?: string;
  date?: string;
  currency?: string;
}

interface BulkEditModalProps {
  count: number;
  accounts: { id: string; name: string }[];
  categories: string[];
  onConfirm: (fields: BulkEditFields) => void;
  onClose: () => void;
}

const TX_TYPES = ['income', 'expense', 'investing', 'transfer', 'debt_payment'];
const CURRENCIES = ['GBP', 'USD', 'EUR', 'GBX'];

const BulkEditModal: React.FC<BulkEditModalProps> = ({ count, accounts, categories, onConfirm, onClose }) => {
  const [fields, setFields] = useState<BulkEditFields>({});
  const [showConfirm, setShowConfirm] = useState(false);

  const patch = (k: keyof BulkEditFields, v: string) =>
    setFields(prev => ({ ...prev, [k]: v || undefined }));

  const activeChanges = Object.entries(fields).filter(([, v]) => v !== undefined && v !== '');

  const handleApply = () => {
    if (activeChanges.length === 0) return;
    setShowConfirm(true);
  };

  const labelFor: Record<string, string> = {
    accountId: 'Account',
    type:      'Type',
    category:  'Category',
    date:      'Date',
    currency:  'Currency',
  };
  const valueLabel = (k: string, v: string) => {
    if (k === 'accountId') return accounts.find(a => a.id === v)?.name ?? v;
    return v;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 bg-[#131517] border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2px] text-white">Bulk Edit</h3>
            <p className="text-[10px] font-mono text-iron-dust mt-0.5">{count} transactions selected</p>
          </div>
          <button onClick={onClose} className="text-iron-dust hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {!showConfirm ? (
          <>
            <div className="p-6 space-y-4">
              <p className="text-[10px] font-mono text-iron-dust/70 uppercase tracking-wider">Leave a field blank to keep its current value</p>

              <div className="grid grid-cols-2 gap-4">

                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Account</label>
                  <select value={fields.accountId ?? ''}
                    onChange={e => patch('accountId', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— keep current —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Type</label>
                  <select value={fields.type ?? ''}
                    onChange={e => patch('type', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— keep current —</option>
                    {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Category</label>
                  <input list="bulk-cats" value={fields.category ?? ''}
                    onChange={e => patch('category', e.target.value)}
                    placeholder="— keep current —"
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none" />
                  <datalist id="bulk-cats">{categories.map((c, i) => <option key={i} value={c} />)}</datalist>
                </div>

                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Date (override all)</label>
                  <input type="date" value={fields.date ?? ''}
                    onChange={e => patch('date', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none" />
                </div>

                <div>
                  <label className="text-[9px] font-mono text-iron-dust block mb-1 uppercase tracking-wider">Currency</label>
                  <select value={fields.currency ?? ''}
                    onChange={e => patch('currency', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 px-3 py-2 text-xs text-white rounded-sm focus:border-magma outline-none">
                    <option value="">— keep current —</option>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

              </div>
            </div>

            <div className="px-6 py-4 bg-[#131517] border-t border-white/5 flex justify-end gap-3">
              <button onClick={onClose}
                className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleApply} disabled={activeChanges.length === 0}
                className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 disabled:opacity-40 transition-colors">
                Review Changes
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <p className="text-sm font-bold text-white">Are you sure you want to:</p>
              <ul className="space-y-2">
                {activeChanges.map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-iron-dust uppercase tracking-wider">{labelFor[k] ?? k}</span>
                    <span className="text-iron-dust">→</span>
                    <span className="text-white font-bold">{valueLabel(k, v as string)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-white">for <span className="text-magma font-bold">{count} transaction{count !== 1 ? 's' : ''}</span>?</p>
              <p className="text-[10px] text-iron-dust font-mono">This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-[#131517] border-t border-white/5 flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">
                Back
              </button>
              <button onClick={() => onConfirm(fields)}
                className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">
                Confirm & Apply
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export const Transactions: React.FC = () => {
  const { data, deleteTransaction, deleteTransactions, updateTransaction, currencySymbol, deletingTransactions } = useFinance();
  const [search,            setSearch]            = useState('');
  const [filterType,        setFilterType]        = useState<string>('all');
  const [sortBy,            setSortBy]            = useState<SortOption>('newest');
  const [showModal,         setShowModal]         = useState(false);
  const [selectMode,        setSelectMode]        = useState(false);
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showBulkEdit,      setShowBulkEdit]      = useState(false);
  const [showImport,        setShowImport]        = useState(false);
  const [selectedTx,        setSelectedTx]        = useState<Transaction | null>(null);

  const allAccounts = useMemo(() => [...data.assets, ...data.debts], [data.assets, data.debts]);

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    allAccounts.forEach(a => map[a.id] = a.name);
    return map;
  }, [allAccounts]);

  const uniqueCategories = useMemo(() =>
    Array.from(new Set(data.transactions.map(t => t.category))).sort(),
  [data.transactions]);

  const filteredTransactions = useSmartSearch(
    data.transactions, accountMap, search, filterType, sortBy
  );

  const allSelected = filteredTransactions.length > 0 &&
    filteredTransactions.every(tx => selectedIds.has(tx.id));

  const toggleSelectMode = () => { setSelectMode(p => !p); setSelectedIds(new Set()); };
  const toggleSelect     = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll  = () => allSelected
    ? setSelectedIds(new Set())
    : setSelectedIds(new Set(filteredTransactions.map(tx => tx.id)));

  const handleConfirmDelete = async () => {
    await deleteTransactions(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowConfirmDelete(false);
    setSelectMode(false);
  };

  const handleBulkEdit = async (fields: BulkEditFields) => {
    const updates: Record<string, any> = {};
    if (fields.accountId) updates.accountId = fields.accountId;
    if (fields.type)      updates.type      = fields.type;
    if (fields.category)  updates.category  = fields.category;
    if (fields.date)      updates.date      = new Date(fields.date).toISOString();
    if (fields.currency)  updates.currency  = fields.currency;
    // Fire updates in parallel
    await Promise.all(Array.from(selectedIds).map(id => updateTransaction(id, updates)));
    setShowBulkEdit(false);
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  return (
    <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up relative overflow-y-auto custom-scrollbar">

      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
          <h1 className="text-4xl font-bold text-white tracking-tight">Transactions</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={toggleSelectMode}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors border',
              selectMode ? 'bg-white/10 border-white/20 text-white' : 'bg-shale border-white/10 text-white hover:bg-white/5'
            )}>
            <CheckSquare size={14} />
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-shale border border-white/10 rounded-sm text-xs font-bold uppercase tracking-wider text-white hover:bg-white/5 transition-colors">
            <Upload size={14} />
            Import CSV
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]">
            <Plus size={14} />
            Add New
          </button>
        </div>
      </div>

      <div className="tectonic-card bg-[#161618] border border-white/5 flex-1 flex flex-col overflow-hidden rounded-sm">

        {/* Toolbar */}
        <div className="p-4 border-b border-white/5 flex gap-3 items-center flex-wrap">

          <SmartSearchBar
            value={search}
            onChange={setSearch}
            accounts={allAccounts}
            categories={uniqueCategories}
          />

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {['all', 'income', 'expense', 'investing', 'debt_payment'].map(type => (
              <button key={type} onClick={() => setFilterType(type)}
                className={clsx(
                  'px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                  filterType === type ? 'bg-white text-obsidian' : 'text-iron-dust hover:text-white hover:bg-white/5'
                )}>
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
            className="ml-auto px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors appearance-none cursor-pointer">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount-high">Amount High</option>
            <option value="amount-low">Amount Low</option>
          </select>

          {selectMode && (
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-white rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors">
                {allSelected ? <CheckSquare size={12} className="text-magma" /> : <Square size={12} />}
                Select All
              </button>
              {selectedIds.size > 0 && (
                <>
                  <button onClick={() => setShowBulkEdit(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-400/30 text-blue-300 rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors">
                    <Edit2 size={13} />
                    Edit {selectedIds.size}
                  </button>
                  <button onClick={() => setShowConfirmDelete(true)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-magma/10 border border-magma/30 text-magma rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/20 transition-colors">
                    <Trash2 size={13} />
                    Delete {selectedIds.size}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#1a1c1e] z-10 shadow-sm">
              <tr>
                {selectMode && (
                  <th className="py-3 px-4 border-b border-white/5 w-10">
                    <button onClick={toggleSelectAll} className="text-iron-dust hover:text-white transition-colors">
                      {allSelected ? <CheckSquare size={15} className="text-magma" /> : <Square size={15} />}
                    </button>
                  </th>
                )}
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Date</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Description</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Account</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Type</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Category</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 text-right">Amount</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map(tx => {
                const isSelected  = selectedIds.has(tx.id);
                const typeLabel   = TYPE_LABELS[tx.type] ?? tx.type;
                const typeColor   = TYPE_COLORS[tx.type]  ?? 'text-iron-dust bg-white/5 border-white/10';
                const { value, prefix, colorClass } = getDisplayAmount(tx);
                return (
                  <tr key={tx.id}
                    onClick={selectMode ? () => toggleSelect(tx.id) : () => setSelectedTx(tx)}
                    className={clsx('group transition-colors cursor-pointer',
                      isSelected ? 'bg-magma/5' : 'hover:bg-white/[0.02]'
                    )}>
                    {selectMode && (
                      <td className="py-4 px-4">
                        {isSelected ? <CheckSquare size={15} className="text-magma" /> : <Square size={15} className="text-iron-dust" />}
                      </td>
                    )}
                    <td className="py-4 px-6 text-xs text-iron-dust font-mono">{format(new Date(tx.date), 'MMM dd')}</td>
                    <td className={clsx('py-4 px-6 text-sm font-medium transition-colors', isSelected ? 'text-magma' : 'text-white group-hover:text-magma')}>
                      {tx.description}
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">
                        {accountMap[tx.accountId ?? ''] || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={clsx('inline-flex items-center px-2 py-1 rounded-sm text-[10px] font-mono font-bold border uppercase', typeColor)}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-1 rounded-sm text-[10px] font-mono bg-white/5 text-iron-dust border border-white/5 uppercase">
                        {tx.category}
                      </span>
                    </td>
                    <td className={clsx('py-4 px-6 text-sm font-mono font-bold text-right', colorClass)}>
                      {prefix}{currencySymbol}{value.toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {!selectMode && (
                        <button onClick={e => { e.stopPropagation(); deleteTransaction(tx.id); }}
                          className="text-iron-dust hover:text-magma opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={selectMode ? 8 : 7} className="py-12 text-center text-iron-dust font-mono text-xs">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AddTransactionModal isOpen={showModal} onClose={() => setShowModal(false)} />
      <CSVImportModal isOpen={showImport} onClose={() => setShowImport(false)} />
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onDelete={id => { deleteTransaction(id); setSelectedTx(null); }}
      />

      {showBulkEdit && (
        <BulkEditModal
          count={selectedIds.size}
          accounts={allAccounts}
          categories={uniqueCategories}
          onConfirm={handleBulkEdit}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {showConfirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-sm rounded-sm shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517]">
              <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Confirm Delete</h3>
              <button onClick={() => setShowConfirmDelete(false)} disabled={deletingTransactions} className="text-iron-dust hover:text-white disabled:opacity-50">
                <X size={18} />
              </button>
            </div>
            <div className="p-8">
              {deletingTransactions ? (
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-cyan-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-cyan-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-cyan-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-xs text-iron-dust font-mono">Deleting transactions…</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-white mb-2">
                    You are about to delete <span className="text-magma font-bold">{selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}</span>.
                  </p>
                  <p className="text-xs text-iron-dust font-mono">This action is not reversible.</p>
                </>
              )}
            </div>
            {!deletingTransactions && (
              <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-end gap-3">
                <button onClick={() => setShowConfirmDelete(false)}
                  className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={handleConfirmDelete}
                  className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">Delete {selectedIds.size}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
