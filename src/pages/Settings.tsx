import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Download, Upload, Trash2, AlertCircle, Check } from 'lucide-react';
import { clsx } from 'clsx';

export const Settings: React.FC = () => {
  const { data } = useFinance();
  const [deleteType, setDeleteType] = useState<string>('none');
  const [monthsToDelete, setMonthsToDelete] = useState<number>(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const stats = useMemo(() => {
    const txCount = data.transactions.length;
    const accountCount = data.assets.length;
    const debtCount = data.debts.length;
    const billCount = data.bills.length;
    const totalValue = data.assets.reduce((sum, a) => sum + a.startingValue, 0);

    return { txCount, accountCount, debtCount, billCount, totalValue };
  }, [data]);

  const handleExportCSV = () => {
    let csv = '';

    csv += 'TRANSACTIONS\n';
    csv += 'Date,Description,Amount,Type,Category,Account\n';
    data.transactions.forEach(tx => {
      csv += `${tx.date},"${tx.description}",${tx.amount},${tx.type},${tx.category},${tx.accountId}\n`;
    });

    csv += '\n\nACCOUNTS\n';
    csv += 'Name,Type,Institution,Currency,Starting Value,Interest Rate\n';
    data.assets.forEach(a => {
      csv += `"${a.name}",${a.type},"${a.institution}",${a.currency},${a.startingValue},"${a.interestRate || ''}"\n`;
    });

    csv += '\n\nDEBTS\n';
    csv += 'Name,Type,Limit,APR,Min Payment Type,Min Payment Value,Starting Value\n';
    data.debts.forEach(d => {
      csv += `"${d.name}",${d.type},${d.limit},${d.apr},${d.minPaymentType},${d.minPaymentValue},${d.startingValue}\n`;
    });

    csv += '\n\nBILLS\n';
    csv += 'Name,Amount,Due Date,Category,Auto Pay,Is Paid\n';
    data.bills.forEach(b => {
      csv += `"${b.name}",${b.amount},"${b.dueDate}",${b.category},${b.autoPay},${b.isPaid}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lithos-finance-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lithos-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (!confirmDelete || deleteType === 'none') return;

    switch (deleteType) {
      case 'all_transactions':
        console.log('Delete all transactions');
        break;
      case 'recent_transactions':
        console.log(`Delete transactions from last ${monthsToDelete} months`);
        break;
      case 'accounts':
        console.log('Delete all accounts');
        break;
      case 'investments':
        console.log('Delete all investments');
        break;
      case 'debts':
        console.log('Delete all debts');
        break;
      case 'bills':
        console.log('Delete all bills');
        break;
      case 'factory_reset':
        console.log('Factory reset - delete all data');
        break;
    }

    setDeleteSuccess(true);
    setConfirmDelete(false);
    setDeleteType('none');
    setTimeout(() => setDeleteSuccess(false), 3000);
  };

  const deleteOptions = [
    { value: 'none', label: 'Select deletion type...' },
    { value: 'all_transactions', label: 'All Transactions' },
    { value: 'recent_transactions', label: 'Transactions from Last X Months' },
    { value: 'accounts', label: 'All Accounts (set balances to 0)' },
    { value: 'investments', label: 'All Investments' },
    { value: 'debts', label: 'All Debts' },
    { value: 'bills', label: 'All Bills' },
    { value: 'factory_reset', label: 'Factory Reset (Delete Everything)' },
  ];

  return (
    <div className="p-12 max-w-4xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
      <div>
        <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
        <h1 className="text-4xl font-bold text-white tracking-tight mb-1">Settings</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-12">
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Transactions</div>
          <div className="text-2xl font-bold text-white">{stats.txCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Accounts</div>
          <div className="text-2xl font-bold text-white">{stats.accountCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Debts</div>
          <div className="text-2xl font-bold text-white">{stats.debtCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Bills</div>
          <div className="text-2xl font-bold text-white">{stats.billCount}</div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Download size={18} />
            Export Data
          </h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-iron-dust mb-3">Export all your financial data as CSV for use in spreadsheets</p>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors"
              >
                <Download size={14} />
                Export as CSV
              </button>
            </div>

            <div>
              <p className="text-sm text-iron-dust mb-3">Export complete backup as JSON for archiving or migration</p>
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors"
              >
                <Download size={14} />
                Export as JSON
              </button>
            </div>
          </div>
        </div>

        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Upload size={18} />
            Import Data
          </h3>

          <div>
            <p className="text-sm text-iron-dust mb-4">Import a previously exported JSON backup to restore your data</p>
            <label className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors cursor-pointer w-fit">
              <Upload size={14} />
              Choose File
              <input type="file" accept=".json" className="hidden" onChange={() => {}} />
            </label>
          </div>
        </div>

        <div className="border border-red-900/30 rounded-sm p-8 bg-red-900/5">
          <h3 className="text-lg font-bold text-red-400 mb-6 flex items-center gap-2">
            <Trash2 size={18} />
            Delete Data
          </h3>

          <div className="space-y-4">
            <p className="text-sm text-iron-dust">Permanently delete specific data. This action cannot be undone.</p>

            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                Select Data to Delete
              </label>
              <select
                value={deleteType}
                onChange={e => {
                  setDeleteType(e.target.value);
                  setConfirmDelete(false);
                }}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
              >
                {deleteOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {deleteType === 'recent_transactions' && (
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                  Months to Delete
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={monthsToDelete}
                  onChange={e => setMonthsToDelete(parseInt(e.target.value))}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              </div>
            )}

            {deleteType !== 'none' && deleteType !== 'factory_reset' && (
              <div className="bg-yellow-900/10 border border-yellow-900/30 rounded-sm p-4 flex gap-3">
                <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-600">
                  This will permanently delete the selected data. Make sure you have a backup.
                </div>
              </div>
            )}

            {deleteType === 'factory_reset' && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-sm p-4 flex gap-3">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-400">
                  This will delete ALL your financial data including transactions, accounts, debts, bills, and investments. This action is permanent and cannot be undone.
                </div>
              </div>
            )}

            {deleteType !== 'none' && (
              <div className="flex gap-3">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-6 py-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-900/30 transition-colors"
                  >
                    Confirm Delete
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-6 py-3 bg-red-600 border border-red-600 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
                    >
                      Delete Permanently
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {deleteSuccess && (
          <div className="bg-emerald-900/10 border border-emerald-900/30 rounded-sm p-4 flex gap-3 animate-in fade-in">
            <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-400">
              Data deleted successfully
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
