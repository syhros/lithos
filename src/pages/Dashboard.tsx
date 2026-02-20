
import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { AreaChart, Area, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, YAxis, XAxis, CartesianGrid } from 'recharts';
import { format, differenceInMinutes, subMonths } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Calendar, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bill } from '../data/mockData';

// --- Helpers ---

const getNextBillDueDate = (bill: Bill): Date => {
  if (!bill.isRecurring) {
    return new Date(bill.dueDate);
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (bill.frequency === 'monthly') {
    const dayOfMonth = parseInt(bill.dueDate, 10);
    const nextDate = new Date(currentYear, currentMonth, dayOfMonth);
    if (nextDate <= now) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return nextDate;
  } else if (bill.frequency === 'weekly') {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(bill.dueDate.toLowerCase());
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + daysUntil);
    return nextDate;
  } else {
    return new Date(bill.dueDate);
  }
};

// --- Components ---

const Sparkline: React.FC<{ data: any[], dataKey: string, color: string, className?: string }> = ({ data, dataKey, color, className }) => (
    <div className={clsx("opacity-60", className)}>
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
                <defs>
                    <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} isAnimationActive={false} />
            </AreaChart>
        </ResponsiveContainer>
    </div>
);

const GridBox: React.FC<{
    label: string;
    value: number | undefined;
    color: string;
    history: any[];
    dataKey: string;
    currencySymbol: string;
    plValue?: number;
    plPercent?: number;
}> = ({ label, value, color, history, dataKey, currencySymbol, plValue, plPercent }) => {
    const isProfit = plValue !== undefined ? plValue >= 0 : true;
    const plColor = isProfit ? '#00f2ad' : '#ff4d00';
    const displayValue = value ?? 0;

    return (
        <div className="group relative bg-[#161618] border border-white/5 p-6 rounded-sm h-[220px] flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:bg-[#1a1c1e]">
            {/* Dynamic Accent Line: slides up/fills on hover */}
            <div className="absolute left-0 bottom-0 w-[4px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: color }} />

            <div className="relative z-10">
                <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[3px] block mb-2 group-hover:text-white transition-colors">{label}</span>
                <div className="text-4xl font-bold text-white tracking-tight">
                    {currencySymbol}{displayValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-24 w-full px-4 pb-2">
                 <Sparkline data={history} dataKey={dataKey} color={color} className="w-full h-full" />
            </div>
        </div>
    );
};

const ActivityItem: React.FC<{
    title: string;
    subtitle: string;
    amount: number;
    currencySymbol: string;
}> = ({ title, subtitle, amount, currencySymbol }) => {
    const isPositive = amount > 0;
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
                {amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(amount).toFixed(2)}
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

// --- Custom Tooltips ---

const CustomSpendingTooltip = ({ active, payload, label, data, currencySymbol }: any) => {
    if (active && payload && payload.length) {
        const currentItem = payload[0].payload;
        // Find current index to compare with previous
        const index = data.findIndex((d: any) => d.name === currentItem.name);
        const prevItem = data[index - 1];

        // Calculate % change
        let pctChange = 0;
        let isUp = false;

        if (prevItem && prevItem.amount > 0) {
            pctChange = ((currentItem.amount - prevItem.amount) / prevItem.amount) * 100;
            isUp = pctChange > 0;
        }

        return (
            <div className="bg-[#1a1c1e] border border-white/10 p-3 rounded-sm shadow-xl min-w-[140px]">
                <p className="text-xs font-bold text-white mb-2 uppercase tracking-widest">
                    {currentItem.fullName}
                </p>
                <p className="text-[10px] text-iron-dust font-mono mb-1">
                    Amount: <span className="text-white">{currencySymbol}{currentItem.amount.toLocaleString()}</span>
                </p>
                {prevItem && (
                    <p className={clsx("text-[10px] font-mono font-bold flex items-center gap-1", isUp ? "text-magma" : "text-emerald-vein")}>
                        {Math.abs(pctChange).toFixed(1)}% {isUp ? '▲' : '▼'} vs last month
                    </p>
                )}
            </div>
        );
    }
    return null;
};

// --- Main Dashboard ---

export const Dashboard: React.FC = () => {
  const { data, getTotalNetWorth, currentBalances, currentPrices, getHistory, lastUpdated, refreshData, loading, currencySymbol, gbpUsdRate } = useFinance();
  
  // Global Time Range State
  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '1Y'>('1M');
  
  // Chart Visibility State
  const [visibleSeries, setVisibleSeries] = useState({ netWorth: true, assets: false, debts: false });

  // Calculations
  const currentNetWorth = getTotalNetWorth();
  const [nwInt, nwDec] = currentNetWorth.toFixed(2).split('.');

  // Header Metrics Logic
  const minsSinceUpdate = differenceInMinutes(new Date(), lastUpdated);
  const isStale = minsSinceUpdate > 5; // Consider stale if > 5 mins old

  // Derived Historical Data (Syncs everything)
  const historyData = useMemo(() => getHistory(timeRange), [timeRange, data.transactions, getHistory]);

  const checkingAccounts = useMemo(() => data.assets.filter(a => a.type === 'checking' && !a.isClosed), [data.assets]);
  const savingsAccounts = useMemo(() => data.assets.filter(a => a.type === 'savings' && !a.isClosed), [data.assets]);
  const investmentAccounts = useMemo(() => data.assets.filter(a => a.type === 'investment' && !a.isClosed), [data.assets]);

  const totalCheckingBalance = useMemo(() =>
    checkingAccounts.reduce((sum, a) => sum + (currentBalances[a.id] || 0), 0),
    [checkingAccounts, currentBalances]
  );
  const totalSavingsBalance = useMemo(() =>
    savingsAccounts.reduce((sum, a) => sum + (currentBalances[a.id] || 0), 0),
    [savingsAccounts, currentBalances]
  );

  const holdings = useMemo(() => {
    const map = new Map<string, any>();
    const userCurrency = data.user.currency || 'GBP';

    data.transactions
      .filter(t => t.type === 'investing' && t.symbol && t.quantity)
      .forEach(t => {
        if (!map.has(t.symbol)) {
          map.set(t.symbol, {
            symbol: t.symbol,
            quantity: 0,
            totalCost: 0,
            currency: t.currency || 'GBP'
          });
        }
        const h = map.get(t.symbol)!;
        h.quantity += t.quantity || 0;
        h.totalCost += (t.amount || 0);
        if (t.currency) h.currency = t.currency;
      });

    return Array.from(map.values()).map(h => {
      const marketData = currentPrices[h.symbol];
      const nativeCurrency = marketData?.currency || h.currency || 'GBP';
      const stockIsUsd = nativeCurrency === 'USD';
      const userIsUsd = userCurrency === 'USD';

      let fxRate = 1;
      if (gbpUsdRate > 0) {
        if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
        if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
      }

      const nativePrice = marketData ? marketData.price : 0;
      const displayPrice = nativePrice * fxRate;
      const currentValue = h.quantity * displayPrice;

      return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue };
    });
  }, [data.transactions, currentPrices, data.user.currency, gbpUsdRate]);

  const totalInvestmentBalance = useMemo(() =>
    holdings.reduce((sum, h) => sum + h.currentValue, 0),
    [holdings]
  );
  const totalLiabilitiesBalance = useMemo(() =>
    data.debts.reduce((sum, d) => sum + d.startingValue, 0),
    [data.debts]
  );

  const accountsPL = useMemo(() => {
    const checkingStarting = checkingAccounts.reduce((sum, a) => sum + a.startingValue, 0);
    const savingsStarting = savingsAccounts.reduce((sum, a) => sum + a.startingValue, 0);
    const totalStarting = checkingStarting + savingsStarting;

    const currentAccounts = totalCheckingBalance + totalSavingsBalance;
    const plValue = currentAccounts - totalStarting;
    const plPercent = totalStarting > 0 ? (plValue / totalStarting) * 100 : 0;

    return { plValue, plPercent };
  }, [checkingAccounts, savingsAccounts, totalCheckingBalance, totalSavingsBalance]);

  // Expenses for Spending Trend (Simulated from transaction ledger for last 6 months)
  const spendingTrend = useMemo(() => {
      // Group expenses by month from ledger
      const monthlySpend = new Map<string, number>();
      data.transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            const m = format(new Date(t.date), 'MMM yy');
            monthlySpend.set(m, (monthlySpend.get(m) || 0) + Math.abs(t.amount));
        });

      // Convert to array (last 6 months)
      const months = [];
      const today = new Date();
      // We iterate 0 to 5 (0 is today, 5 is 5 months ago)
      // Then reverse it so the chart reads left-to-right (oldest-to-newest)
      for (let i = 5; i >= 0; i--) {
          const date = subMonths(today, i);
          const key = format(date, 'MMM yy');
          const shortName = format(date, 'MMM');
          // Full name for tooltip: 'Nov 23'
          months.push({
              name: shortName, // X-axis label
              fullName: key, // Tooltip label
              amount: monthlySpend.get(key) || 0
          });
      }
      return months;
  }, [data.transactions]);

  const upcomingBills = useMemo(() => {
    return data.bills
      .map(bill => ({ bill, dueDate: getNextBillDueDate(bill) }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 6)
      .map(({ bill }) => (
        <BillItem key={bill.id} name={bill.name} date={getNextBillDueDate(bill)} amount={bill.amount} currencySymbol={currencySymbol} />
      ));
  }, [data.bills, currencySymbol]);

  const isLoading = loading && data.assets.length === 0 && data.transactions.length === 0;
  const isEmpty = data.assets.length === 0;

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
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm flex items-center justify-center mx-auto mb-6">
            <span className="text-2xl">📊</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Welcome to Lithos Finance</h2>
          <p className="text-iron-dust text-sm mb-6">Get started by creating your first account to track your finances.</p>
          <Link to="/accounts" className="inline-block px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] h-full overflow-hidden bg-[#0a0a0c]">

        {/* CENTER MAIN CONTENT */}
        <div className="flex flex-col h-full overflow-y-auto p-12 custom-scrollbar">
            
            {/* 1. Hero Section & Header Metrics */}
            <div className="mb-4 mt-4 slide-up">
                {/* Header Row: Label + Metadata on same line */}
                <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Total Net Worth</span>
                    
                    {/* Actions Group */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-sm border border-white/5">
                           <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px] animate-pulse", loading ? "bg-yellow-400 shadow-yellow-400" : isStale ? "bg-red-500 shadow-red-500" : "bg-emerald-vein shadow-emerald-vein")}></div>
                           <span className={clsx("text-[10px] font-bold uppercase tracking-widest", isStale ? "text-red-400" : loading ? "text-yellow-400" : "text-white")}>
                               {loading ? 'SYNCING...' : isStale ? 'OFFLINE' : 'LIVE'}
                           </span>
                        </div>
                        <span className="font-mono text-[10px] text-iron-dust">
                            Updated {format(lastUpdated, 'HH:mm')}
                        </span>
                        <button 
                            onClick={() => refreshData()}
                            disabled={loading}
                            className={clsx("p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5", loading && "animate-spin cursor-not-allowed opacity-50")}
                        >
                            <RefreshCw size={12} />
                        </button>
                    </div>
                </div>

                <h1 className="text-[6.5rem] font-black leading-none tracking-[-4px] text-white">
                    {currencySymbol}{parseInt(nwInt).toLocaleString()}
                    <span className="font-light opacity-30 text-[4rem] tracking-normal">.{nwDec}</span>
                </h1>
            </div>

            {/* 2. Wealth Trajectory Chart */}
            <div className="mb-6 slide-up" style={{ animationDelay: '0.1s' }}>
                 <h3 className="font-mono text-xs text-iron-dust uppercase tracking-[3px] mb-4">Wealth Trajectory</h3>
                 
                 {/* Chart Container */}
                <div className="h-[400px] w-full bg-[#161618] border border-white/5 rounded-sm relative flex flex-col p-6">
                     
                     {/* Controls Header (Flex) */}
                     <div className="flex justify-between items-start mb-2 z-10">
                         {/* Legend & Toggles - Grey Mono, No Glow */}
                         <div className="flex gap-6">
                            <button 
                                onClick={() => setVisibleSeries(p => ({ ...p, netWorth: !p.netWorth }))}
                                className={`flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-opacity hover:opacity-100 ${visibleSeries.netWorth ? 'opacity-100 text-white' : 'opacity-40 text-iron-dust'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${visibleSeries.netWorth ? 'bg-emerald-vein' : 'bg-iron-dust'}`} /> Net Worth
                            </button>
                            <button 
                                onClick={() => setVisibleSeries(p => ({ ...p, assets: !p.assets }))}
                                className={`flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-opacity hover:opacity-100 ${visibleSeries.assets ? 'opacity-100 text-white' : 'opacity-40 text-iron-dust'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${visibleSeries.assets ? 'bg-gold-ore' : 'bg-iron-dust'}`} /> Assets
                            </button>
                            <button 
                                onClick={() => setVisibleSeries(p => ({ ...p, debts: !p.debts }))}
                                className={`flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-opacity hover:opacity-100 ${visibleSeries.debts ? 'opacity-100 text-white' : 'opacity-40 text-iron-dust'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${visibleSeries.debts ? 'bg-magma' : 'bg-iron-dust'}`} /> Debts
                            </button>
                        </div>

                        {/* Range Selector */}
                        <div className="flex bg-[#1a1c1e] rounded-sm p-1 border border-white/5">
                            {['1W', '1M', '1Y'].map(range => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range as any)}
                                    className={`px-4 py-1.5 text-[10px] font-mono font-bold rounded-sm transition-all ${timeRange === range ? 'bg-white text-black' : 'text-iron-dust hover:text-white'}`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                     </div>

                    {/* Chart Area */}
                    <div className="flex-1 w-full min-h-0">
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00f2ad" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#00f2ad" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="gradAsset" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                                <XAxis 
                                    hide={true}
                                    dataKey="date" 
                                />
                                <YAxis 
                                    tick={{fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono'}} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => `${currencySymbol}${val/1000}k`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                                    itemStyle={{ padding: 0, textTransform: 'capitalize' }}
                                    formatter={(value: number, name: string) => [`${currencySymbol}${value.toLocaleString()}`, name]}
                                />
                                {visibleSeries.assets && (
                                    <Area type="monotone" name="Assets" dataKey="assets" stroke="#d4af37" strokeWidth={2} fill="url(#gradAsset)" isAnimationActive={true} />
                                )}
                                {visibleSeries.debts && (
                                    <Area type="monotone" name="Debts" dataKey="debts" stroke="#ff4d00" strokeWidth={2} fill="transparent" isAnimationActive={true} />
                                )}
                                {visibleSeries.netWorth && (
                                    <Area type="monotone" name="Net Worth" dataKey="netWorth" stroke="#00f2ad" strokeWidth={3} fill="url(#gradNW)" isAnimationActive={true} />
                                )}
                            </AreaChart>
                         </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* 3. Asset/Liability Grid (2x2) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 slide-up" style={{ animationDelay: '0.2s' }}>
                <GridBox
                    label="Accounts"
                    value={totalCheckingBalance + totalSavingsBalance}
                    color="#00f2ad"
                    history={historyData}
                    dataKey="checking"
                    currencySymbol={currencySymbol}
                    plValue={accountsPL.plValue}
                    plPercent={accountsPL.plPercent}
                />
                <GridBox
                    label="Savings"
                    value={totalSavingsBalance}
                    color="#d4af37"
                    history={historyData}
                    dataKey="savings"
                    currencySymbol={currencySymbol}
                />
                <GridBox
                    label="Stocks"
                    value={totalInvestmentBalance}
                    color="#3b82f6"
                    history={historyData}
                    dataKey="investing"
                    currencySymbol={currencySymbol}
                />
                <GridBox
                    label="Liabilities"
                    value={totalLiabilitiesBalance}
                    color="#ff4d00"
                    history={historyData}
                    dataKey="debts"
                    currencySymbol={currencySymbol}
                />
            </div>
        </div>

        {/* RIGHT SIDEBAR - Activity & Trends */}
        <div className="bg-[#111315] border-l border-white/5 p-10 overflow-y-auto custom-scrollbar flex flex-col">
            
            {/* Activity Log */}
            <div className="slide-up mb-12" style={{ animationDelay: '0.3s' }}>
                <div className="flex justify-between items-center mb-6">
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Activity Log</span>
                    <Link to="/transactions" className="text-[10px] font-bold uppercase tracking-wider text-magma hover:text-white transition-colors">
                        View All
                    </Link>
                </div>
                <div className="space-y-1">
                    {data.transactions.slice(0, 6).map(tx => (
                        <ActivityItem
                            key={tx.id}
                            title={tx.description.split('-')[0].trim()}
                            subtitle={tx.category}
                            amount={tx.amount}
                            currencySymbol={currencySymbol}
                        />
                    ))}
                </div>
            </div>

            {/* Upcoming Bills */}
            <div className="slide-up mb-12" style={{ animationDelay: '0.4s' }}>
                 <div className="flex justify-between items-center mb-6">
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Upcoming Bills</span>
                    <Link to="/bills" className="text-[10px] font-bold uppercase tracking-wider text-magma hover:text-white transition-colors">
                        View All
                    </Link>
                </div>
                <div className="space-y-1">
                    {upcomingBills}
                </div>
            </div>

            {/* Spending Trend Bar Chart (Reduced Spacing via flex layout or margin) */}
            <div className="mt-auto slide-up" style={{ animationDelay: '0.5s' }}>
                 <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-6">Spending Trend</span>
                 <div className="h-[150px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={spendingTrend}>
                            <Tooltip 
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                content={<CustomSpendingTooltip data={spendingTrend} currencySymbol={currencySymbol} />}
                            />
                            <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                                {spendingTrend.map((entry, index) => (
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
