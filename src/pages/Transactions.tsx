import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Search, Plus, Upload, Trash2, CheckSquare, Square, X } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { CSVImportModal } from '../components/CSVImportModal';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { Transaction } from '../data/mockData';

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

export const Transactions: React.FC = () => {
  const { data, deleteTransaction, deleteTransactions, currencySymbol } = useFinance();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showModal, setShowModal] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const accountMap = useMemo(() => {
      const map: Record<string, string> = {};
      [...data.assets, ...data.debts].forEach(a => map[a.id] = a.name);
      return map;
  }, [data.assets, data.debts]);

  const filteredTransactions = useMemo(() => {
    const filtered = data.transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(search.toLowerCase()) ||
                            tx.category.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || tx.type === filterType;
      return matchesSearch && matchesType;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-high':
          return Math.abs(b.amount) - Math.abs(a.amount);
        case 'amount-low':
          return Math.abs(a.amount) - Math.abs(b.amount);
        default:
          return 0;
      }
    });

    return sorted;
  }, [data.transactions, search, filterType, sortBy]);

  const allSelected = filteredTransactions.length > 0 && filteredTransactions.every(tx => selectedIds.has(tx.id));

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map(tx => tx.id)));
    }
  };

  const handleConfirmDelete = () => {
    deleteTransactions(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowConfirmDelete(false);
    setSelectMode(false);
  };

  return (
    <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up relative overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
          <h1 className="text-4xl font-bold text-white tracking-tight">Transactions</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={toggleSelectMode}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors border',
              selectMode
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-shale border-white/10 text-white hover:bg-white/5'
            )}
          >
            <CheckSquare size={14} />
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-shale border border-white/10 rounded-sm text-xs font-bold uppercase tracking-wider text-white hover:bg-white/5 transition-colors"
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
          >
            <Plus size={14} />
            Add New
          </button>
        </div>
      </div>

      <div className="tectonic-card bg-[#161618] border border-white/5 flex-1 flex flex-col overflow-hidden rounded-sm">
        <div className="p-4 border-b border-white/5 flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-iron-dust w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0a0a0c] border border-white/10 rounded-sm py-2 pl-10 pr-4 text-xs text-white placeholder-iron-dust focus:outline-none focus:border-magma/50 transition-colors font-mono"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {['all', 'income', 'expense', 'investing', 'debt_payment'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={clsx(
                  'px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                  filterType === type
                    ? 'bg-white text-obsidian'
                    : 'text-iron-dust hover:text-white hover:bg-white/5'
                )}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors appearance-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount-high">Amount High</option>
              <option value="amount-low">Amount Low</option>
            </select>
          </div>

          {selectMode && (
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-white rounded-sm text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                {allSelected ? <CheckSquare size={12} className="text-magma" /> : <Square size={12} />}
                Select All
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setShowConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-magma/10 border border-magma/30 text-magma rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/20 transition-colors"
                >
                  <Trash2 size={13} />
                  Delete {selectedIds.size}
                </button>
              )}
            </div>
          )}
        </div>

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
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Category</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 text-right">Amount</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map((tx) => {
                const isSelected = selectedIds.has(tx.id);
                return (
                  <tr
                    key={tx.id}
                    onClick={selectMode ? () => toggleSelect(tx.id) : () => setSelectedTx(tx)}
                    className={clsx(
                      'group transition-colors cursor-pointer',
                      isSelected ? 'bg-magma/5' : 'hover:bg-white/[0.02]'
                    )}
                  >
                    {selectMode && (
                      <td className="py-4 px-4">
                        <div className="text-iron-dust">
                          {isSelected ? <CheckSquare size={15} className="text-magma" /> : <Square size={15} />}
                        </div>
                      </td>
                    )}
                    <td className="py-4 px-6 text-xs text-iron-dust font-mono">
                      {format(new Date(tx.date), 'MMM dd')}
                    </td>
                    <td className={clsx('py-4 px-6 text-sm font-medium transition-colors', isSelected ? 'text-magma' : 'text-white group-hover:text-magma')}>
                      {tx.description}
                    </td>
                    <td className="py-4 px-6">
                       <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">
                           {accountMap[tx.accountId] || 'Unknown'}
                       </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-1 rounded-sm text-[10px] font-mono bg-white/5 text-iron-dust border border-white/5 uppercase">
                        {tx.category}
                      </span>
                    </td>
                    <td className={clsx(
                      'py-4 px-6 text-sm font-mono font-bold text-right',
                      tx.amount > 0 ? 'text-emerald-vein' : 'text-white'
                    )}>
                      {tx.amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(tx.amount).toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {!selectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteTransaction(tx.id); }}
                          className="text-iron-dust hover:text-magma opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                  <tr>
                      <td colSpan={selectMode ? 7 : 6} className="py-12 text-center text-iron-dust font-mono text-xs">
                          No transactions found.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddTransactionModal isOpen={showModal} onClose={() => setShowModal(false)} />
      <CSVImportModal isOpen={showImport} onClose={() => setShowImport(false)} />
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onDelete={id => { deleteTransaction(id); setSelectedTx(null); }}
      />

      {showConfirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-sm rounded-sm shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517]">
              <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Confirm Delete</h3>
              <button onClick={() => setShowConfirmDelete(false)} className="text-iron-dust hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-8">
              <p className="text-sm text-white mb-2">
                You are about to delete <span className="text-magma font-bold">{selectedIds.size} transaction{selectedIds.size !== 1 ? 's' : ''}</span>.
              </p>
              <p className="text-xs text-iron-dust font-mono">This action is not reversible.</p>
            </div>
            <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors"
              >
                Delete {selectedIds.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
