import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { HistoryRange } from '../context/FinanceContext';
import { AreaChart, Area, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, YAxis, XAxis, CartesianGrid } from 'recharts';
import { format, differenceInMinutes, subMonths } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Wallet, PiggyBank, TrendingUp, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bill } from '../data/mockData';
import { useSyncedCounter } from '../hooks/useSyncedCounter';

// --- Helpers ---

const getNextBillDueDate = (bill: Bill): Date => {
  if (!bill.isRecurring) return new Date(bill.dueDate);
  const now = new Date();
  if (bill.frequency === 'monthly') {
    const dayOfMonth = parseInt(bill.dueDate, 10);
    const nextDate = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
    if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  } else if (bill.frequency === 'weekly') {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetDay = dayNames.indexOf(bill.dueDate.toLowerCase());
    let daysUntil = targetDay - now.getDay();
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + daysUntil);
    return nextDate;
  }
  return new Date(bill.dueDate);
};

const ActivityItem: React.FC<{ title: string; subtitle: string; amount: number; type: string; category: string; currencySymbol: string }> = ({ title, subtitle, amount, type, category, currencySymbol }) => {
  const abs = Math.abs(amount);
  let prefix = '';
  let isPositive = false;
  if (type === 'income') { prefix = '+'; isPositive = true; }
  else if (type === 'expense') { prefix = '-'; isPositive = false; }
  else if (type === 'investing') {
    const cat = (category || '').toLowerCase();
    if (cat === 'sell' || cat === 'dividend') { prefix = '+'; isPositive = true; }
    else { prefix = ''; isPositive = false; }
  } else if (type === 'debt_payment') { prefix = '-'; isPositive = false; }
  else { prefix = amount > 0 ? '+' : '-'; isPositive = amount > 0; }

  const truncatedTitle = title.length > 24 ? title.substring(0, 24) + '...' : title;
  return (
    <div className="flex justify-between items-center py-4 border-b border-white/5 last:border-0 group cursor-pointer hover:bg-white/[0.02] px-2 -mx-2 rounded-sm transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#1a1c1e] border ${isPositive ? 'border-emerald-vein/20 text-emerald-vein' : 'border-iron-dust/20 text-iron-dust'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        </div>
        <div>
          <h4 className="text-xs font-bold text-white mb-0.5 group-hover:text-magma transition-colors">{truncatedTitle}</h4>
          <p className="font-mono text-[9px] text-iron-dust uppercase tracking-wider">{subtitle}</p>
        </div>
      </div>
      <div className={`font-mono text-xs font-bold ${isPositive ? 'text-emerald-vein' : 'text-white'}`}>
        {prefix}{currencySymbol}{abs.toFixed(2)}
      </div>
    </div>
  );
};

const BillItem: React.FC<{ name: string; date: Date; amount: number; currencySymbol: string }> = ({ name, date, amount, currencySymbol }) => (
  <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
    <div className="flex items-center gap-3">
      <Calendar size={14} className="text-iron-dust" />
      <div>
        <h4 className="text-xs font-bold text-white">{name}</h4>
        <p className="font-mono text-[9px] text-iron-dust">Due {format(date, 'MMM dd')}</p>
      </div>
    </div>
    <div className="font-mono text-xs text-white">{currencySymbol}{amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
  </div>
);

const CustomSpendingTooltip = ({ active, payload, data, currencySymbol }: any) => {
  if (active && payload && payload.length) {
    const currentItem = payload[0].payload;
    const index = data.findIndex((d: any) => d.name === currentItem.name);
    const prevItem = data[index - 1];
    let pctChange = 0, isUp = false;
    if (prevItem && prevItem.amount > 0) {
      pctChange = ((currentItem.amount - prevItem.amount) / prevItem.amount) * 100;
      isUp = pctChange > 0;
    }
    return (
      <div className="bg-[#1a1c1e] border border-white/10 p-3 rounded-sm shadow-xl min-w-[140px]">
        <p className="text-xs font-bold text-white mb-2 uppercase tracking-widest">{currentItem.fullName}</p>
        <p className="text-[10px] text-iron-dust font-mono mb-1">Amount: <span className="text-white">{currencySymbol}{currentItem.amount.toLocaleString()}</span></p>
        {prevItem && (
          <p className={clsx("text-[10px] font-mono font-bold flex items-center gap-1", isUp ? "text-magma" : "text-emerald-vein")}>
            {Math.abs(pctChange).toFixed(1)}% {isUp ? '\u25b2' : '\u25bc'} vs last month
          </p>
        )}
      </div>
    );
  }
  return null;
};

// Metric card — investment-page style with larger typography
const MetricCard: React.FC<{
  label: string;
  value: number;
  history: any[];
  dataKey: string;
  color: string;
  icon: React.ReactNode;
  currencySymbol: string;
  isLiability?: boolean;
}> = ({ label, value, history, dataKey, color, icon, currencySymbol, isLiability = false }) => {
  const first = history.length > 0 ? (history[0]?.[dataKey] ?? 0) : 0;
  const last  = history.length > 0 ? (history[history.length - 1]?.[dataKey] ?? 0) : 0;
  const delta = last - first;
  const pct   = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;

  // For liabilities: going down is good (green), going up is bad (red)
  const isUp = isLiability ? delta < 0 : delta >= 0;
  const pctLabel = pct === 0 ? '0.00%' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

  const whole = Math.floor(Math.abs(value)).toLocaleString();
  const dec   = Math.abs(value).toFixed(2).split('.')[1];

  // sparkline domain
  const vals = history.map(d => d[dataKey] ?? 0).filter(v => v > 0);
  const minVal = vals.length > 0 ? Math.min(...vals) * 0.97 : 'auto';

  return (
    // Fixed height 240px as requested
    <div className="group bg-[#161618] border border-white/5 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer flex flex-col" style={{ height: 240 }}>
      {/* accent bar on hover */}
      <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: color }} />
      {/* sparkline background */}
      <div className="absolute bottom-0 right-0 pointer-events-none"
        style={{ width: '65%', height: '60%', opacity: 0.7,
          maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`dashGrad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={[minVal, 'auto']} hide />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
              fill={`url(#dashGrad-${dataKey})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* content */}
      <div className="relative z-10 p-5 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-sm text-white shrink-0">{icon}</div>
            {/* Label: ~20% bigger — was text-[10px], now text-xs (12px) */}
            <span className="font-mono text-xs text-iron-dust uppercase tracking-[2px]">{label}</span>
          </div>
          {/* % badge: ~20% bigger — was text-[10px], now text-xs (12px) */}
          <span className={clsx(
            'px-2.5 py-1 rounded text-xs font-mono font-bold uppercase shrink-0 ml-2',
            isUp ? 'bg-emerald-vein/10 text-emerald-vein' : 'bg-magma/10 text-magma'
          )}>
            {isLiability ? (delta < 0 ? pctLabel : `+${Math.abs(pct).toFixed(2)}%`) : pctLabel}
          </span>
        </div>
        <div className="mt-auto">
          {/* Main value: 3.5rem as requested */}
          <div className="font-black text-white tracking-tight leading-none" style={{ fontSize: '3.5rem' }}>
            {currencySymbol}{whole}<span className="font-light opacity-30" style={{ fontSize: '2.2rem' }}>.{dec}</span>
          </div>
          {/* Delta: ~40% bigger — was text-[10px], now text-sm (14px) */}
          <div className={clsx('text-sm font-mono mt-2', isUp ? 'text-emerald-vein' : 'text-magma')}>
            {isUp ? (isLiability ? '-' : '+') : (isLiability ? '+' : '-')}{currencySymbol}{Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Dashboard ---

export const Dashboard: React.FC = () => {
  const { data, getTotalNetWorth, currentBalances, currentPrices, getHistory, lastUpdated, refreshData, loading, currencySymbol, gbpUsdRate } = useFinance();

  const [timeRange, setTimeRange] = useState<HistoryRange>('1W');
  const [visibleSeries, setVisibleSeries] = useState({ netWorth: true, assets: false, debts: false });

  const currentNetWorth = getTotalNetWorth();

  const { displayValue, isPulsing } = useSyncedCounter(currentNetWorth, loading, 'lithos_net_worth');
  const [nwInt, nwDec] = displayValue.toFixed(2).split('.');

  const minsSinceUpdate = differenceInMinutes(new Date(), lastUpdated);
  const isStale = minsSinceUpdate > 5;

  const historyData = useMemo(() => getHistory(timeRange), [timeRange, data.transactions, data.assets, data.debts, currentPrices, gbpUsdRate]);

  const checkingAccounts = useMemo(() => data.assets.filter(a => a.type === 'checking' && !a.isClosed), [data.assets]);
  const savingsAccounts  = useMemo(() => data.assets.filter(a => a.type === 'savings'  && !a.isClosed), [data.assets]);

  const totalCheckingBalance = useMemo(() =>
    checkingAccounts.reduce((sum, a) => sum + (currentBalances[a.id] || 0), 0), [checkingAccounts, currentBalances]);
  const totalSavingsBalance = useMemo(() =>
    savingsAccounts.reduce((sum, a) => sum + (currentBalances[a.id] || 0), 0), [savingsAccounts, currentBalances]);

  const holdings = useMemo(() => {
    const map = new Map<string, any>();
    const userCurrency = data.user.currency || 'GBP';
    data.transactions
      .filter(t => t.type === 'investing' && t.symbol && t.quantity)
      .forEach(t => {
        if (!map.has(t.symbol)) map.set(t.symbol, { symbol: t.symbol, quantity: 0, totalCost: 0, currency: t.currency || 'GBP' });
        const h = map.get(t.symbol)!;
        h.quantity += t.quantity || 0;
        h.totalCost += (t.amount || 0);
        if (t.currency) h.currency = t.currency;
      });
    return Array.from(map.values()).map(h => {
      const marketData = currentPrices[h.symbol];
      const nativeCurrency = marketData?.currency || h.currency || 'GBP';
      const stockIsUsd = nativeCurrency === 'USD';
      const stockIsGbx = nativeCurrency === 'GBX';
      const userIsUsd = userCurrency === 'USD';
      let fxRate = 1;
      if (gbpUsdRate > 0) {
        if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
        if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
      }
      const nativePrice = marketData ? marketData.price : 0;
      let displayPrice = stockIsGbx ? nativePrice / 100 : nativePrice * fxRate;
      return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue: h.quantity * displayPrice };
    });
  }, [data.transactions, currentPrices, data.user.currency, gbpUsdRate]);

  const totalInvestmentBalance = useMemo(() => holdings.reduce((sum, h) => sum + h.currentValue, 0), [holdings]);

  const totalLiabilitiesBalance = useMemo(() =>
    data.debts.reduce((sum, d) => sum + (currentBalances[d.id] ?? d.startingValue), 0),
    [data.debts, currentBalances]
  );

  const spendingTrend = useMemo(() => {
    const monthlySpend = new Map<string, number>();
    data.transactions.filter(t => t.type === 'expense').forEach(t => {
      const m = format(new Date(t.date), 'MMM yy');
      monthlySpend.set(m, (monthlySpend.get(m) || 0) + Math.abs(t.amount));
    });
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(today, i);
      const key = format(date, 'MMM yy');
      months.push({ name: format(date, 'MMM'), fullName: key, amount: monthlySpend.get(key) || 0 });
    }
    return months;
  }, [data.transactions]);

  const upcomingBills = useMemo(() =>
    data.bills
      .map(bill => ({ bill, dueDate: getNextBillDueDate(bill) }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 6)
      .map(({ bill }) => <BillItem key={bill.id} name={bill.name} date={getNextBillDueDate(bill)} amount={bill.amount} currencySymbol={currencySymbol} />)
  , [data.bills, currencySymbol]);

  const recentTransactions = useMemo(() =>
    [...data.transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6),
    [data.transactions]
  );

  const isLoading = loading && data.assets.length === 0 && data.transactions.length === 0;
  const isEmpty   = data.assets.length === 0;

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-magma/30 border-t-magma rounded-full animate-spin mx-auto mb-6" />
          <p className="font-mono text-iron-dust uppercase text-sm tracking-wider">Loading your finances...</p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0a0c]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm flex items-center justify-center mx-auto mb-6"><span className="text-2xl">\uD83D\uDCCA</span></div>
          <h2 className="text-xl font-bold text-white mb-2">Welcome to Lithos Finance</h2>
          <p className="text-iron-dust text-sm mb-6">Get started by creating your first account to track your finances.</p>
          <Link to="/accounts" className="inline-block px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">Create Account</Link>
        </div>
      </div>
    );
  }

  const RANGES: HistoryRange[] = ['1W', '1M', '3M', '6M', '1Y', 'all'];
  const RANGE_LABELS: Record<HistoryRange, string> = { '1W': '1W', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1Y', 'all': 'All' };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] h-full overflow-hidden bg-[#0a0a0c]">
      {/* Main scroll area — max-width so it doesn't stretch too wide */}
      <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-[1200px] mx-auto px-12 py-12 flex flex-col">

          {/* Header — Net Worth */}
          <div className="mb-4 mt-4 slide-up">
            <div className="flex justify-between items-center mb-1">
              <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Total Net Worth</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-sm border border-white/5">
                  <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px] animate-pulse", loading ? "bg-yellow-400 shadow-yellow-400" : isStale ? "bg-red-500 shadow-red-500" : "bg-emerald-vein shadow-emerald-vein")} />
                  <span className={clsx("text-[10px] font-bold uppercase tracking-widest", isStale ? "text-red-400" : loading ? "text-yellow-400" : "text-white")}>
                    {loading ? 'SYNCING...' : isStale ? 'OFFLINE' : 'LIVE'}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-iron-dust">Updated {format(lastUpdated, 'HH:mm')}</span>
                <button onClick={() => refreshData()} disabled={loading}
                  className={clsx("p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5", loading && "animate-spin cursor-not-allowed opacity-50")}>
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
            <h1 className={clsx("font-black leading-none tracking-[-4px] text-white", isPulsing && "animate-pulse-opacity")} style={{ fontSize: '7.5rem' }}>
              {currentNetWorth < 0 ? '-' : ''}{currencySymbol}{Math.abs(parseInt(nwInt.replace(/[^0-9]/g, ''))).toLocaleString()}
              <span className="font-light opacity-30 tracking-normal" style={{ fontSize: '4.6rem' }}>.{nwDec}</span>
            </h1>
          </div>

          {/* Wealth Trajectory Chart */}
          <div className="mb-6 slide-up" style={{ animationDelay: '0.1s' }}>
            <h3 className="font-mono text-xs text-iron-dust uppercase tracking-[3px] mb-4">Wealth Trajectory</h3>
            <div className="w-full bg-[#161618] border border-white/5 rounded-sm relative flex flex-col p-6" style={{ height: 460 }}>
              {/* Single row: series toggles LEFT, range selector RIGHT — all inline */}
              <div className="flex justify-between items-center mb-4 z-10 gap-4">
                {/* Series toggles */}
                <div className="flex gap-5 flex-wrap">
                  {(['netWorth','assets','debts'] as const).map(key => (
                    <button key={key} onClick={() => setVisibleSeries(p => ({ ...p, [key]: !p[key] }))}
                      className={`flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-opacity hover:opacity-100 ${
                        visibleSeries[key] ? 'opacity-100 text-white' : 'opacity-40 text-iron-dust'
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        visibleSeries[key]
                          ? key === 'netWorth' ? 'bg-emerald-vein'
                          : key === 'assets'   ? 'bg-gold-ore'
                          : 'bg-magma'
                          : 'bg-iron-dust'
                      }`} />
                      {key === 'netWorth' ? 'Net Worth' : key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                  ))}
                </div>
                {/* Range selector */}
                <div className="flex bg-[#1a1c1e] rounded-sm p-1 border border-white/5 shrink-0">
                  {RANGES.map(range => (
                    <button key={range} onClick={() => setTimeRange(range)}
                      className={`px-3 py-1.5 text-[10px] font-mono font-bold rounded-sm transition-all ${
                        timeRange === range ? 'bg-white text-black' : 'text-iron-dust hover:text-white'
                      }`}>{RANGE_LABELS[range]}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00f2ad" stopOpacity={0.2}/><stop offset="95%" stopColor="#00f2ad" stopOpacity={0}/></linearGradient>
                      <linearGradient id="gradAsset" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d4af37" stopOpacity={0.2}/><stop offset="95%" stopColor="#d4af37" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                    <XAxis hide dataKey="date" />
                    <YAxis tick={{fill:'#8e8e93',fontSize:10,fontFamily:'JetBrains Mono'}} tickLine={false} axisLine={false} tickFormatter={v => `${currencySymbol}${v/1000}k`} />
                    <Tooltip contentStyle={{backgroundColor:'#1a1c1e',borderColor:'rgba(255,255,255,0.1)',color:'#fff',fontSize:'12px',fontFamily:'JetBrains Mono'}} itemStyle={{padding:0,textTransform:'capitalize'}} formatter={(v: number, n: string) => [`${currencySymbol}${v.toLocaleString()}`, n]} />
                    {visibleSeries.assets   && <Area type="monotone" name="Assets"    dataKey="assets"   stroke="#d4af37" strokeWidth={2} fill="url(#gradAsset)" isAnimationActive />}
                    {visibleSeries.debts    && <Area type="monotone" name="Debts"     dataKey="debts"    stroke="#ff4d00" strokeWidth={2} fill="transparent"   isAnimationActive />}
                    {visibleSeries.netWorth && <Area type="monotone" name="Net Worth" dataKey="netWorth" stroke="#00f2ad" strokeWidth={3} fill="url(#gradNW)"  isAnimationActive />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 slide-up pb-2" style={{ animationDelay: '0.2s' }}>
            <MetricCard label="Accounts"    value={totalCheckingBalance + totalSavingsBalance} history={historyData} dataKey="checking"  color="#00f2ad" icon={<Wallet size={16} />}    currencySymbol={currencySymbol} />
            <MetricCard label="Savings"     value={totalSavingsBalance}                        history={historyData} dataKey="savings"   color="#d4af37" icon={<PiggyBank size={16} />} currencySymbol={currencySymbol} />
            <MetricCard label="Stocks"      value={totalInvestmentBalance}                     history={historyData} dataKey="investing" color="#3b82f6" icon={<TrendingUp size={16} />} currencySymbol={currencySymbol} />
            <MetricCard label="Liabilities" value={totalLiabilitiesBalance}                   history={historyData} dataKey="debts"     color="#ff4d00" icon={<CreditCard size={16} />} currencySymbol={currencySymbol} isLiability />
          </div>

        </div>
      </div>

      {/* Sidebar */}
      <div className="bg-[#111315] border-l border-white/5 p-10 overflow-y-auto custom-scrollbar flex flex-col">
        <div className="slide-up mb-12" style={{ animationDelay: '0.3s' }}>
          <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Activity Log</span>
            <Link to="/transactions" className="text-[10px] font-bold uppercase tracking-wider text-magma hover:text-white transition-colors">View All</Link>
          </div>
          <div className="space-y-1">
            {recentTransactions.map(tx => (
              <ActivityItem
                key={tx.id}
                title={tx.description.split('-')[0].trim()}
                subtitle={tx.category}
                amount={tx.amount}
                type={tx.type}
                category={tx.category}
                currencySymbol={currencySymbol}
              />
            ))}
          </div>
        </div>
        <div className="slide-up mb-12" style={{ animationDelay: '0.4s' }}>
          <div className="flex justify-between items-center mb-6">
            <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Upcoming Bills</span>
            <Link to="/bills" className="text-[10px] font-bold uppercase tracking-wider text-magma hover:text-white transition-colors">View All</Link>
          </div>
          <div className="space-y-1">{upcomingBills}</div>
        </div>
        <div className="mt-auto slide-up" style={{ animationDelay: '0.5s' }}>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-6">Spending Trend</span>
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendingTrend}>
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<CustomSpendingTooltip data={spendingTrend} currencySymbol={currencySymbol} />} />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                  {spendingTrend.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === spendingTrend.length - 1 ? '#ff4d00' : '#2d3136'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center font-mono text-[9px] text-iron-dust mt-4 uppercase tracking-widest">6 Month History</p>
        </div>
      </div>
    </div>
  );
};
