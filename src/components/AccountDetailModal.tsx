import React, { useMemo, useState } from 'react';
import { X, TrendingUp, ArrowUpRight, ArrowDownRight, Pencil, Check, Trash2, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { Asset, AssetType, Currency } from '../data/mockData';

interface AccountDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Asset | null;
}

const COLORS = ['#00f2ad', '#d4af37', '#3b82f6', '#f97316', '#e85d04', '#ec4899', '#14b8a6'];

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({ isOpen, onClose, account }) => {
  const { data, currentBalances, updateAccount, deleteAccount, currencySymbol } = useFinance();

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editCurrency, setEditCurrency] = useState<Currency>('GBP');
  const [editInterestRate, setEditInterestRate] = useState('');
  const [editStartingValue, setEditStartingValue] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIsClosed, setEditIsClosed] = useState(false);
  const [editOpenedDate, setEditOpenedDate] = useState('');
  const [editClosedDate, setEditClosedDate] = useState('');

  const balance = account ? currentBalances[account.id] || 0 : 0;

  const monthlyInterest = useMemo(() => {
    if (!account || account.type !== 'savings' || !account.interestRate) return null;
    return (balance * (account.interestRate / 100)) / 12;
  }, [account, balance]);

  const allAccountMap = useMemo(() => {
    const map: Record<string, string> = {};
    [...data.assets, ...data.debts].forEach(a => { map[a.id] = a.name; });
    return map;
  }, [data.assets, data.debts]);

  const transactions = useMemo(() => {
    if (!account) return [];
    return (data?.transactions || [])
      .filter(t => t.accountId === account.id || t.accountToId === account.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [data?.transactions, account]);

  // Build a true per-account 30-day running balance chart
  const chartData = useMemo(() => {
    if (!account) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // All txns for this account (no slice limit), sorted oldest → newest
    const accountTxns = (data?.transactions || [])
      .filter(t => t.accountId === account.id || t.accountToId === account.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Current balance is the source of truth — walk backwards from it
    // to find starting balance 30 days ago
    const cutoff = subDays(today, 30);

    // Sum of all txns AFTER cutoff (these are in our 30-day window)
    const windowDelta = accountTxns
      .filter(t => {
        const d = new Date(t.date);
        d.setHours(0, 0, 0, 0);
        return d > cutoff;
      })
      .reduce((sum, t) => {
        // Credits to this account are positive, debits are negative
        if (t.accountToId === account.id) return sum + Math.abs(t.amount);
        return sum + t.amount;
      }, 0);

    // Balance at the start of the 30-day window
    const startBalance = balance - windowDelta;

    // Build daily points
    const points: { date: string; value: number }[] = [];
    for (let i = 30; i >= 0; i--) {
      const day = subDays(today, i);
      day.setHours(0, 0, 0, 0);
      const dayStr = format(day, 'yyyy-MM-dd');

      // Sum all txns on this day
      const dayDelta = accountTxns
        .filter(t => {
          const d = new Date(t.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === day.getTime();
        })
        .reduce((sum, t) => {
          if (t.accountToId === account.id) return sum + Math.abs(t.amount);
          return sum + t.amount;
        }, 0);

      points.push({ date: dayStr, dayDelta });
    }

    // Walk forward from startBalance accumulating deltas
    let running = startBalance;
    return points.map(p => {
      running += (p as any).dayDelta;
      return { date: p.date, value: running };
    });
  }, [account, data?.transactions, balance]);

  const chartMin = chartData.length > 0
    ? Math.min(...chartData.map(d => d.value)) * 0.97
    : 'auto';

  const firstVal = chartData[0]?.value ?? 0;
  const lastVal  = chartData[chartData.length - 1]?.value ?? 0;
  const chartUp  = lastVal >= firstVal;
  const chartColor = chartUp ? '#00f2ad' : '#ff4d00';

  const income   = transactions.filter(t => t.amount > 0 || (t.type === 'transfer' && t.accountToId === account?.id)).reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = transactions.filter(t => t.amount < 0 && !(t.type === 'transfer' && t.accountToId === account?.id)).reduce((s, t) => s + Math.abs(t.amount), 0);

  const openEdit = () => {
    if (!account) return;
    setEditName(account.name);
    setEditInstitution(account.institution || '');
    setEditCurrency(account.currency);
    setEditInterestRate(account.interestRate?.toString() || '');
    setEditStartingValue(account.startingValue.toString());
    setEditColor(account.color || COLORS[0]);
    setEditIsClosed(account.isClosed || false);
    setEditOpenedDate(account.openedDate || '');
    setEditClosedDate(account.closedDate || '');
    setEditMode(true);
  };

  const saveEdit = () => {
    if (!account) return;
    updateAccount(account.id, {
      name: editName,
      institution: editInstitution,
      currency: editCurrency,
      startingValue: parseFloat(editStartingValue) || account.startingValue,
      interestRate: account.type === 'savings' && editInterestRate ? parseFloat(editInterestRate) : undefined,
      color: editColor,
      isClosed: editIsClosed,
      openedDate: editOpenedDate || undefined,
      closedDate: editIsClosed && editClosedDate ? editClosedDate : undefined,
    });
    setEditMode(false);
  };

  if (!isOpen || !account) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-3xl max-h-[85vh] rounded-sm shadow-2xl overflow-hidden slide-up flex flex-col">

        <div className="p-6 border-b border-white/5 flex justify-between items-start bg-[#131517]">
          <div>
            <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[3px] block mb-1">{account.institution}</span>
            <h2 className="text-2xl font-bold text-white tracking-tight">{account.name}</h2>
            <span className="inline-block mt-1 px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
              {account.type}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Current Balance</span>
              <span className={clsx('text-2xl font-bold tracking-tight', balance < 0 ? 'text-magma' : 'text-white')}>
                {balance < 0 ? '-' : ''}{currencySymbol}{Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {!editMode && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this account?')) {
                    deleteAccount(account.id);
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors border bg-red-900/10 border-red-900/30 text-red-400 hover:bg-red-900/20"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
            <button
              onClick={editMode ? saveEdit : openEdit}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors border',
                editMode
                  ? 'bg-emerald-vein/10 border-emerald-vein/30 text-emerald-vein hover:bg-emerald-vein/20'
                  : 'bg-white/5 border-white/10 text-iron-dust hover:text-white hover:border-white/20'
              )}
            >
              {editMode ? <Check size={13} /> : <Pencil size={13} />}
              {editMode ? 'Save' : 'Edit'}
            </button>
            <button onClick={() => { setEditMode(false); onClose(); }} className="p-2 hover:bg-white/5 rounded-full text-iron-dust hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">

          {editMode ? (
            <div className="bg-[#161618] border border-white/5 rounded-sm p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-2">Edit Account</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Account Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Institution</label>
                  <input
                    type="text"
                    value={editInstitution}
                    onChange={e => setEditInstitution(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Currency</label>
                  <select
                    value={editCurrency}
                    onChange={e => setEditCurrency(e.target.value as Currency)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                  >
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Starting Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                    <input
                      type="number"
                      value={editStartingValue}
                      onChange={e => setEditStartingValue(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {account.type === 'savings' && (
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    value={editInterestRate}
                    onChange={e => setEditInterestRate(e.target.value)}
                    placeholder="e.g. 5.1"
                    step="0.01"
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Opened Date</label>
                  <input
                    type="date"
                    value={editOpenedDate}
                    onChange={e => setEditOpenedDate(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                  />
                </div>
              </div>

              <div className="border border-white/5 rounded-sm p-4 bg-black/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">Mark as Closed</span>
                  <button
                    onClick={() => setEditIsClosed(c => !c)}
                    className={clsx(
                      'w-10 h-5 rounded-full transition-all relative',
                      editIsClosed ? 'bg-red-600' : 'bg-white/10'
                    )}
                  >
                    <span className={clsx(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                      editIsClosed ? 'left-5' : 'left-0.5'
                    )} />
                  </button>
                </div>
                {editIsClosed && (
                  <div>
                    <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Closed Date</label>
                    <input
                      type="date"
                      value={editClosedDate}
                      onChange={e => setEditClosedDate(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Accent Color</label>
                <div className="flex gap-3">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className={clsx(
                        'w-7 h-7 rounded-full transition-all',
                        editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#161618] scale-110' : 'opacity-60 hover:opacity-100'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="h-[220px] bg-[#161618] border border-white/5 rounded-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">30 Day Performance</span>
                  <span className={clsx('text-[10px] font-mono font-bold flex items-center gap-1', chartUp ? 'text-emerald-vein' : 'text-magma')}>
                    {chartUp ? <TrendingUp size={10} /> : null}
                    {chartUp ? '+' : ''}{firstVal !== 0 ? (((lastVal - firstVal) / Math.abs(firstVal)) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acctGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.04} />
                    <XAxis dataKey="date" hide={true} />
                    <YAxis
                      tick={{ fill: '#8e8e93', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[chartMin, 'auto']}
                      tickFormatter={val => `${currencySymbol}${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                      formatter={(val: number) => [`${currencySymbol}${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Balance']}
                    />
                    <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fill="url(#acctGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                  <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Institution</span>
                  <span className="text-sm font-bold text-white">{account.institution || '—'}</span>
                </div>
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                  <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Currency</span>
                  <span className="text-sm font-bold text-white">{account.currency}</span>
                </div>
                {account.type === 'savings' && account.interestRate && (
                  <>
                    <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                      <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Annual Rate</span>
                      <span className="text-sm font-bold text-emerald-vein">{account.interestRate}%</span>
                    </div>
                    <div className="bg-[#161618] p-4 rounded-sm border border-emerald-vein/20 bg-emerald-vein/5">
                      <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Est. Monthly Interest</span>
                      <span className="text-sm font-bold text-emerald-vein">
                        +{currencySymbol}{monthlyInterest?.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                {!(account.type === 'savings' && account.interestRate) && (
                  <>
                    <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                      <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Money In (shown)</span>
                      <span className="text-sm font-bold text-emerald-vein">+{currencySymbol}{income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                      <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Money Out (shown)</span>
                      <span className="text-sm font-bold text-magma">-{currencySymbol}{expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </>
                )}
              </div>

              {account.type === 'savings' && account.interestRate && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Money In (shown)</span>
                    <span className="text-sm font-bold text-emerald-vein">+{currencySymbol}{income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Money Out (shown)</span>
                    <span className="text-sm font-bold text-magma">-{currencySymbol}{expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Recent Transactions</h3>
                <div className="space-y-1">
                  {transactions.length === 0 && (
                    <p className="text-xs font-mono text-iron-dust py-4 text-center">No transactions found.</p>
                  )}
                  {transactions.map(tx => {
                    const isIncoming = tx.type === 'transfer' && tx.accountToId === account.id;
                    const isTransfer = tx.type === 'transfer';
                    const displayAmt = isIncoming ? Math.abs(tx.amount) : tx.amount;
                    return (
                      <div key={tx.id} className="flex justify-between items-center p-4 bg-[#161618] border border-white/5 rounded-sm hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center border',
                            isIncoming || displayAmt > 0 ? 'border-emerald-vein/20 text-emerald-vein' : 'border-white/10 text-iron-dust'
                          )}>
                            {isIncoming || displayAmt > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{tx.description}</p>
                            <p className="text-[9px] font-mono text-iron-dust uppercase">
                              {tx.category} · {format(new Date(tx.date), 'dd MMM yyyy')}
                              {isTransfer && (
                                <span className="ml-1">
                                  {isIncoming
                                    ? <> ← {allAccountMap[tx.accountId ?? ''] || 'Unknown'}</>
                                    : <> → {allAccountMap[tx.accountToId ?? ''] || 'Unknown'}</>
                                  }
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={clsx('text-xs font-mono font-bold',
                          isIncoming || displayAmt > 0 ? 'text-emerald-vein' : 'text-white'
                        )}>
                          {isTransfer ? '' : (displayAmt > 0 ? '+' : '')}{currencySymbol}{Math.abs(displayAmt).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
