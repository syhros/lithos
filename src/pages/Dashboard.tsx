
import React, { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { AreaChart, Area, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, YAxis, XAxis, CartesianGrid } from 'recharts';
import { format, differenceInMinutes, subMonths } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Calendar, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

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
    value: number;
    color: string;
    history: any[];
    dataKey: string;
    currencySymbol: string;
    plValue?: number;
    plPercent?: number;
}> = ({ label, value, color, history, dataKey, currencySymbol, plValue, plPercent }) => {
    const isProfit = plValue !== undefined ? plValue >= 0 : true;
    const plColor = isProfit ? '#00f2ad' : '#ff4d00';

    return (
        <div className="group relative bg-[#161618] border border-white/5 p-6 rounded-sm h-[220px] flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:bg-[#1a1c1e]">
            {/* Dynamic Accent Line: slides up/fills on hover */}
            <div className="absolute left-0 bottom-0 w-[4px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: color }} />

            <div className="relative z-10">
                <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[3px] block mb-2 group-hover:text-white transition-colors">{label}</span>
                <div className="text-4xl font-bold text-white tracking-tight">
                    {currencySymbol}{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                {plValue !== undefined && plPercent !== undefined && (
                    <div className={clsx('text-xs font-mono mt-1 flex items-center gap-1', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                        {isProfit ? '+' : ''}{currencySymbol}{(Math.floor(Math.abs(plValue) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({plPercent.toFixed(1)}%)
                    </div>
                )}
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
    return (
        <div className="flex justify-between items-center py-4 border-b border-white/5 last:border-0 group cursor-pointer hover:bg-white/[0.02] px-2 -mx-2 rounded-sm transition-colors">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#1a1c1e] border ${isPositive ? 'border-emerald-vein/20 text-emerald-vein' : 'border-iron-dust/20 text-iron-dust'}`}>
                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </div>
                <div>
                    <h4 className="text-xs font-bold text-white mb-0.5 group-hover:text-magma transition-colors">{title}</h4>
                    <p className="font-mono text-[9px] text-iron-dust uppercase tracking-wider">{subtitle}</p>
                </div>
            </div>
            <div className={`font-mono text-xs font-bold ${isPositive ? 'text-emerald-vein' : 'text-white'}`}>
                {amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(amount).toFixed(2)}
            </div>
        </div>
    );
};

const BillItem: React.FC<{ name: string; date: string; amount: number; currencySymbol: string }> = ({ name, date, amount, currencySymbol }) => (
    <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-3">
            <Calendar size={14} className="text-iron-dust" />
            <div>
                <h4 className="text-xs font-bold text-white">{name}</h4>
                <p className="font-mono text-[9px] text-iron-dust">Due {format(new Date(date), 'MMM dd')}</p>
            </div>
        </div>
        <div className="font-mono text-xs text-white">{currencySymbol}{amount}</div>
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
  const { data, getTotalNetWorth, currentBalances, getHistory, lastUpdated, refreshData, loading, currencySymbol } = useFinance();
  
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

  // Calculate P/L for accounts (checking + savings)
  const accountsPL = useMemo(() => {
    const checkingAccount = data.assets.find(a => a.id === '1');
    const savingsAccount = data.assets.find(a => a.id === '2');

    const checkingStarting = checkingAccount?.startingValue || 0;
    const savingsStarting = savingsAccount?.startingValue || 0;
    const totalStarting = checkingStarting + savingsStarting;

    const currentAccounts = (currentBalances['1'] || 0) + (currentBalances['2'] || 0);
    const plValue = currentAccounts - totalStarting;
    const plPercent = totalStarting > 0 ? (plValue / totalStarting) * 100 : 0;

    return { plValue, plPercent };
  }, [data.assets, currentBalances]);

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
                           <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px]", isStale ? "bg-iron-dust shadow-none" : "bg-emerald-vein shadow-emerald-vein animate-pulse")}></div>
                           <span className={clsx("text-[10px] font-bold uppercase tracking-widest", isStale ? "text-iron-dust" : "text-white")}>
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
                    value={(currentBalances['1'] || 0) + (currentBalances['2'] || 0)}
                    color="#00f2ad"
                    history={historyData}
                    dataKey="checking"
                    currencySymbol={currencySymbol}
                    plValue={accountsPL.plValue}
                    plPercent={accountsPL.plPercent}
                />
                <GridBox
                    label="Savings"
                    value={currentBalances['2']}
                    color="#d4af37"
                    history={historyData}
                    dataKey="savings"
                    currencySymbol={currencySymbol}
                />
                <GridBox
                    label="Stocks"
                    value={currentBalances['3']}
                    color="#3b82f6"
                    history={historyData}
                    dataKey="investing"
                    currencySymbol={currencySymbol}
                />
                <GridBox
                    label="Liabilities"
                    value={currentBalances['4']}
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
                    {data.bills.slice(0, 5).map(bill => (
                        <BillItem key={bill.id} name={bill.name} date={bill.dueDate} amount={bill.amount} currencySymbol={currencySymbol} />
                    ))}
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
