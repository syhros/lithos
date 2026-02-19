import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Search, Plus, Upload, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { AddTransactionModal } from '../components/AddTransactionModal';

export const Transactions: React.FC = () => {
  const { data, deleteTransaction } = useFinance();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);

  // Helper to get Account Name
  const accountMap = useMemo(() => {
      const map: Record<string, string> = {};
      [...data.assets, ...data.debts].forEach(a => map[a.id] = a.name);
      return map;
  }, [data.assets, data.debts]);

  const filteredTransactions = data.transactions.filter(tx => {
    const matchesSearch = tx.description.toLowerCase().includes(search.toLowerCase()) || 
                          tx.category.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || tx.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col slide-up relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
          <h1 className="text-4xl font-bold text-white tracking-tight">Transactions</h1>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-shale border border-white/10 rounded-sm text-xs font-bold uppercase tracking-wider text-white hover:bg-white/5 transition-colors">
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
        {/* Toolbar */}
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
                  "px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  filterType === type 
                    ? "bg-white text-obsidian" 
                    : "text-iron-dust hover:text-white hover:bg-white/5"
                )}
              >
                {type.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#1a1c1e] z-10 shadow-sm">
              <tr>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Date</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Description</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Account</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5">Category</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 text-right">Amount</th>
                <th className="py-3 px-6 text-[10px] font-bold text-iron-dust uppercase tracking-[2px] border-b border-white/5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 text-xs text-iron-dust font-mono">
                    {format(new Date(tx.date), 'MMM dd')}
                  </td>
                  <td className="py-4 px-6 text-sm text-white font-medium group-hover:text-magma transition-colors">
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
                    "py-4 px-6 text-sm font-mono font-bold text-right",
                    tx.amount > 0 ? "text-emerald-vein" : tx.type === 'investing' ? "text-white" : "text-white"
                  )}>
                    {tx.amount > 0 ? '+' : ''}£{Math.abs(tx.amount).toFixed(2)}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button 
                        onClick={() => deleteTransaction(tx.id)}
                        className="text-iron-dust hover:text-magma opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                  <tr>
                      <td colSpan={6} className="py-12 text-center text-iron-dust font-mono text-xs">
                          No transactions found.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddTransactionModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
};