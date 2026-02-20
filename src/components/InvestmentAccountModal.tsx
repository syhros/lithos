import React, { useMemo, useState } from 'react';
import { X, TrendingUp, TrendingDown, Pencil, Check } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subMonths, eachDayOfInterval, isBefore, parseISO, addDays } from 'date-fns';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { Asset, Currency } from '../data/mockData';

interface InvestmentAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Asset | null;
}

const COLORS = ['#00f2ad', '#d4af37', '#3b82f6', '#f97316', '#e85d04', '#ec4899', '#14b8a6'];

// Returns a display-friendly price string for a holding.
// GBX raw prices (pence) are shown as both Xp and £X/100.
// USD shown as $X. GBP shown as £X.
const formatHoldingPrice = (rawPrice: number, currency: string): string => {
  if (currency === 'GBX') {
    const gbp = rawPrice / 100;
    return `${rawPrice.toFixed(2)}p (\u00a3${gbp.toFixed(4)})`;
  }
  if (currency === 'USD') return `$${rawPrice.toFixed(2)}`;
  return `\u00a3${rawPrice.toFixed(2)}`;
};

export const InvestmentAccountModal: React.FC<InvestmentAccountModalProps> = ({ isOpen, onClose, account }) => {
  const { data, currentBalances, currentPrices, historicalPrices, updateAccount, currencySymbol, gbpUsdRate } = useFinance();

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editCurrency, setEditCurrency] = useState<Currency>('GBP');
  const [editStartingValue, setEditStartingValue] = useState('');
  const [editColor, setEditColor] = useState('');

  const openEdit = () => {
    if (!account) return;
    setEditName(account.name);
    setEditInstitution(account.institution || '');
    setEditCurrency(account.currency);
    setEditStartingValue(account.startingValue.toString());
    setEditColor(account.color || COLORS[0]);
    setEditMode(true);
  };

  const saveEdit = () => {
    if (!account) return;
    updateAccount(account.id, {
      name: editName,
      institution: editInstitution,
      currency: editCurrency,
      startingValue: parseFloat(editStartingValue) || account.startingValue,
      color: editColor,
    });
    setEditMode(false);
  };

  const balance = account ? currentBalances[account.id] || 0 : 0;

  const holdings = useMemo(() => {
    if (!account) return [];
    const map = new Map<string, { symbol: string; quantity: number; totalCost: number; currency: string }>();

    (data?.transactions || []).forEach(tx => {
      if (tx.type === 'investing' && tx.symbol && tx.quantity && tx.accountId === account.id) {
        const cur = map.get(tx.symbol) || { symbol: tx.symbol, quantity: 0, totalCost: 0, currency: tx.currency || 'GBP' };
        const isSell = tx.category === 'Sell';

        if (isSell) {
          if (cur.quantity > 0) {
            const costPerShare = cur.totalCost / cur.quantity;
            cur.totalCost -= tx.quantity * costPerShare;
          }
          cur.quantity += tx.quantity;
        } else {
          cur.quantity += tx.quantity;
          cur.totalCost += Math.abs(tx.amount); // tx.amount is always in GBP
        }

        map.set(tx.symbol, cur);
      }
    });

    return Array.from(map.values()).map(h => {
      const marketData = currentPrices[h.symbol];
      const isGbx = h.currency === 'GBX';
      const isUsd = h.currency === 'USD';
      const fxRate = (isUsd && gbpUsdRate > 0) ? 1 / gbpUsdRate : 1;

      // rawNativePrice: price as returned by API (pence for GBX, USD for USD, GBP for GBP)
      const rawNativePrice = marketData?.price || 0;
      // displayPrice: always in GBP for portfolio value calculations
      const displayPrice = isGbx ? rawNativePrice / 100 : rawNativePrice * fxRate;
      const currentValue = h.quantity * displayPrice; // GBP

      // profitValue is GBP vs GBP (totalCost is already in GBP)
      const profitValue = currentValue - h.totalCost;
      const profitPercent = h.totalCost > 0 ? (profitValue / h.totalCost) * 100 : 0;

      // avgCostGbp: GBP cost per share
      const avgCostGbp = h.quantity > 0 ? h.totalCost / h.quantity : 0;

      return {
        ...h,
        rawNativePrice,
        displayPrice,
        currentValue,
        profitValue,
        profitPercent,
        marketData,
        avgCostGbp,
        isGbx,
        isUsd,
      };
    }).sort((a, b) => b.currentValue - a.currentValue);
  }, [account, data.transactions, currentPrices, gbpUsdRate]);

  const totalCost = holdings.reduce((s, h) => s + h.totalCost, 0);
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalProfit = totalValue - totalCost;
  const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const chartData = useMemo(() => {
    if (!account) return [];

    const today = new Date();
    const start = subMonths(today, 1);
    const dates = eachDayOfInterval({ start, end: today });

    const sortedTxs = data.transactions
      .filter(t => t.type === 'investing' && t.symbol && t.quantity && t.accountId === account.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const holdingQtys: Record<string, number> = {};
    let txIndex = 0;

    const symbolCurrencies: Record<string, string> = {};
    sortedTxs.forEach(t => { if (t.symbol && t.currency) symbolCurrencies[t.symbol] = t.currency; });

    let lastKnownValue = balance;

    return dates.map(date => {
      while (txIndex < sortedTxs.length && isBefore(parseISO(sortedTxs[txIndex].date), addDays(date, 1))) {
        const tx = sortedTxs[txIndex];
        holdingQtys[tx.symbol!] = (holdingQtys[tx.symbol!] || 0) + (tx.quantity || 0);
        txIndex++;
      }

      let val = 0;
      Object.entries(holdingQtys).forEach(([sym, qty]) => {
        const hist = historicalPrices[sym] || {};
        const dateStr = format(date, 'yyyy-MM-dd');
        let price = hist[dateStr] ?? currentPrices[sym]?.price ?? 0;
        const isUsd = symbolCurrencies[sym] === 'USD';
        const isGbx = symbolCurrencies[sym] === 'GBX';
        const fxRate = isUsd && gbpUsdRate > 0 ? 1 / gbpUsdRate : 1;
        if (isGbx) price = price / 100;
        val += qty * price * fxRate;
      });

      if (val > 0) lastKnownValue = val;

      return {
        date: format(date, 'dd MMM'),
        value: val > 0 ? parseFloat(val.toFixed(2)) : lastKnownValue,
      };
    });
  }, [account, data.transactions, historicalPrices, currentPrices, balance, gbpUsdRate]);

  const firstVal = chartData[0]?.value ?? 0;
  const lastVal = chartData[chartData.length - 1]?.value ?? 0;
  const chartUp = lastVal >= firstVal;
  const chartColor = '#3b82f6';

  const chartMin = chartData.length > 0
    ? Math.min(...chartData.map(d => d.value)) * 0.97
    : 'auto';

  if (!isOpen || !account) return null;

  const isProfit = totalProfit >= 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-3xl max-h-[85vh] rounded-sm shadow-2xl overflow-hidden slide-up flex flex-col">

        <div className="p-6 border-b border-white/5 flex justify-between items-start bg-[#131517]">
          <div>
            <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[3px] block mb-1">{account.institution}</span>
            <h2 className="text-2xl font-bold text-white tracking-tight">{account.name}</h2>
            <span className="inline-block mt-1 px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">Investment</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Account Value (GBP)</span>
              <span className="text-2xl font-bold text-white tracking-tight">
                {currencySymbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Total Return (GBP)</span>
              <span className={clsx('text-xl font-bold font-mono', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                {isProfit ? '+' : ''}{currencySymbol}{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
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

          {editMode && (
            <div className="bg-[#161618] border border-white/5 rounded-sm p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-[2px]">Edit Account</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Account Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Institution</label>
                  <input type="text" value={editInstitution} onChange={e => setEditInstitution(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Currency</label>
                  <select value={editCurrency} onChange={e => setEditCurrency(e.target.value as Currency)}
                    className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                    <option value="GBP">GBP (\u00a3)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (\u20ac)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Starting Balance</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                    <input type="number" value={editStartingValue} onChange={e => setEditStartingValue(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Accent Color</label>
                <div className="flex gap-3">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={clsx('w-7 h-7 rounded-full transition-all', editColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#161618] scale-110' : 'opacity-60 hover:opacity-100')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditMode(false)}
                  className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={saveEdit}
                  className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">Save Changes</button>
              </div>
            </div>
          )}

          <div className="h-[200px] bg-[#161618] border border-white/5 rounded-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">30 Day Performance</span>
              <span className={clsx('text-[10px] font-mono font-bold flex items-center gap-1', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                {isProfit ? '+' : ''}{totalProfitPct.toFixed(2)}% total return
              </span>
            </div>
            <ResponsiveContainer width="100%" height="85%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="invAcctGrad" x1="0" y1="0" x2="0" y2="1">
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
                  tickFormatter={val => `${currencySymbol}${(val / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                  formatter={(val: number) => [`${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Value (GBP)']}
                />
                <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fill="url(#invAcctGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Holdings</span>
              <span className="text-lg font-bold text-white">{holdings.length}</span>
            </div>
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Total Invested (GBP)</span>
              <span className="text-sm font-mono text-white">{currencySymbol}{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Market Value (GBP)</span>
              <span className="text-sm font-mono text-white">{currencySymbol}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className={clsx('p-4 rounded-sm border', isProfit ? 'bg-emerald-vein/5 border-emerald-vein/20' : 'bg-magma/5 border-magma/20')}>
              <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Return %</span>
              <span className={clsx('text-sm font-mono font-bold', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                {isProfit ? '+' : ''}{totalProfitPct.toFixed(2)}%
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-vein" />
              Holdings in this Account
            </h3>
            {holdings.length === 0 && (
              <p className="text-xs font-mono text-iron-dust text-center py-6">No holdings found in this account.</p>
            )}
            <div className="space-y-2">
              {holdings.map(h => {
                const hp = h.profitValue >= 0;
                const weight = totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0;
                return (
                  <div key={h.symbol} className="flex items-center gap-4 p-4 bg-[#161618] border border-white/5 rounded-sm">
                    <div className="w-9 h-9 bg-white/5 rounded-full flex items-center justify-center text-white font-bold text-xs border border-white/5 flex-shrink-0">
                      {h.symbol.substring(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-white">{h.symbol}</span>
                        {/* currentValue is always GBP */}
                        <span className="text-sm font-bold text-white font-mono">{currencySymbol}{h.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        {/* Show native price with correct symbol */}
                        <span className="text-[9px] font-mono text-iron-dust">
                          {h.quantity.toFixed(4)} shares \u00b7 {formatHoldingPrice(h.rawNativePrice, h.currency)}
                        </span>
                        <span className={clsx('text-[10px] font-mono font-bold flex items-center gap-1', hp ? 'text-emerald-vein' : 'text-magma')}>
                          {hp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                          {hp ? '+' : ''}{h.profitPercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-2 h-0.5 bg-white/5 rounded-full">
                        <div className="h-full bg-blue-500/40 rounded-full" style={{ width: `${Math.min(weight, 100)}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-iron-dust mt-0.5 block">{weight.toFixed(1)}% of portfolio</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};