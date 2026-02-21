import React, { useMemo, useState } from 'react';
import { useFinance, getCurrencySymbol } from '../context/FinanceContext';
import { LineChart as LineChartIcon, Wallet, TrendingUp, TrendingDown, Plus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { AreaChart, Area, YAxis, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, subMonths, eachDayOfInterval, isBefore, parseISO, addDays, differenceInMinutes, subDays } from 'date-fns';
import { AddAccountModal } from '../components/AddAccountModal';
import { HoldingDetailModal } from '../components/HoldingDetailModal';
import { InvestmentAccountModal } from '../components/InvestmentAccountModal';
import { Asset } from '../data/mockData';
import { useSyncedCounter } from '../hooks/useSyncedCounter';

const tickerAbbrev = (symbol: string): string =>
  symbol.split('-')[0].substring(0, 4).toUpperCase();

const truncateName = (name: string, max = 40): string => {
  if (name.length <= max) return name;
  const words = name.split(' ');
  let result = '';
  for (const word of words) {
    if ((result + (result ? ' ' : '') + word).length > max) break;
    result += (result ? ' ' : '') + word;
  }
  return result || name.substring(0, max);
};

const toTitleCase = (str: string): string =>
  str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export const Investments: React.FC = () => {
    const { data, currentBalances, currentPrices, historicalPrices, getHistory, currencySymbol, lastUpdated, refreshData, loading, gbpUsdRate } = useFinance();
    const userCurrency = data?.user?.currency || 'GBP';
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [selectedHolding, setSelectedHolding] = useState<any>(null);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);
    const [closedOpen, setClosedOpen] = useState(false);

    const minsSinceUpdate = differenceInMinutes(new Date(), lastUpdated);
    const isStale = minsSinceUpdate > 5;

    const investmentAssets = data?.assets?.filter(a => a.type === 'investment') || [];

    const symbolNameMap = useMemo(() => {
        const map = new Map<string, string>();
        (data?.transactions || []).forEach(tx => {
            if (tx.type === 'investing' && tx.symbol && tx.description && !map.has(tx.symbol)) {
                map.set(tx.symbol, tx.description);
            }
        });
        return map;
    }, [data?.transactions]);

    const holdings = useMemo(() => {
        const map = new Map<string, {
            symbol: string;
            quantity: number;
            totalCost: number;
            feeCost: number;
            buyQty: number;
            buyTotalCost: number;
            currency: string;
        }>();

        (data?.transactions || []).forEach(tx => {
            if (tx.type === 'investing' && tx.symbol && tx.quantity) {
                const current = map.get(tx.symbol) || {
                    symbol: tx.symbol,
                    quantity: 0,
                    totalCost: 0,
                    feeCost: 0,
                    buyQty: 0,
                    buyTotalCost: 0,
                    currency: tx.currency || 'GBP',
                };

                const isSell = tx.category === 'Sell';
                const isFee  = tx.category === 'Fee';

                current.quantity += tx.quantity;

                if (isFee) {
                    current.feeCost += Math.abs(tx.amount);
                    current.totalCost += Math.abs(tx.amount);
                } else if (!isSell) {
                    current.totalCost += Math.abs(tx.amount);
                    current.buyQty += tx.quantity;
                    current.buyTotalCost += Math.abs(tx.amount);
                }

                if (tx.currency) current.currency = tx.currency;
                map.set(tx.symbol, current);
            }
        });

        return Array.from(map.values()).map(h => {
            const marketData = currentPrices[h.symbol];
            const nativeCurrency = h.currency || marketData?.currency || 'GBP';
            const stockIsUsd = nativeCurrency === 'USD';
            const stockIsGbx = nativeCurrency === 'GBX';
            const userIsUsd = userCurrency === 'USD';

            let fxRate = 1;
            if (gbpUsdRate > 0) {
              if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
              if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
            }

            const nativePrice = marketData ? marketData.price : 0;
            const displayPrice = stockIsGbx ? nativePrice / 100 : nativePrice * fxRate;
            const currentValue = h.quantity * displayPrice;
            const avgPriceCost = h.buyQty > 0 ? h.buyTotalCost / h.buyQty : 0;

            const profitValue = currentValue - h.totalCost;
            const profitPercent = h.totalCost > 0 ? (profitValue / h.totalCost) * 100 : 0;

            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
            const today = format(new Date(), 'yyyy-MM-dd');
            const history = historicalPrices[h.symbol] || {};
            const yesterdayPrice = history[yesterday] || history[today] || nativePrice;
            const todayPrice = history[today] || nativePrice;
            const dailyChangePercent = yesterdayPrice > 0 ? ((todayPrice - yesterdayPrice) / yesterdayPrice) * 100 : 0;

            const tickerName = symbolNameMap.get(h.symbol) ?? h.symbol;

            return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue, avgPrice: avgPriceCost, profitValue, profitPercent, isZeroCost: h.totalCost === 0, marketData, fxRate, dailyChangePercent, tickerName };
        }).sort((a, b) => b.currentValue - a.currentValue);
    }, [data.transactions, currentPrices, gbpUsdRate, userCurrency, symbolNameMap]);

    const EPSILON = 0.000001;
    const activeHoldings = holdings.filter(h => h.quantity > EPSILON);
    const closedHoldings = holdings.filter(h => h.quantity <= EPSILON);

    const portfolioValue = investmentAssets.reduce((acc, asset) => acc + (currentBalances[asset.id] || 0), 0);

    const { displayValue: portfolioDisplay, isPulsing } = useSyncedCounter(portfolioValue, loading, 'lithos_portfolio_value');
    const [pvInt, pvDec] = portfolioDisplay.toFixed(2).split('.');

    const portfolioChartData = useMemo(() => {
        const history = getHistory('1M');
        return history.map(p => ({ date: p.date, value: p.investing }));
    }, [getHistory]);

    const portfolioUp = (() => {
        const first = portfolioChartData[0]?.value ?? 0;
        const last  = portfolioChartData[portfolioChartData.length - 1]?.value ?? 0;
        return last >= first;
    })();

    const accountChartData = useMemo(() => {
        const result: Record<string, { date: string; value: number }[]> = {};
        investmentAssets.forEach(asset => {
            const today = new Date();
            const start = subMonths(today, 1);
            const dates = eachDayOfInterval({ start, end: today });

            const sortedTxs = (data?.transactions || [])
                .filter(t => t.type === 'investing' && t.symbol && t.quantity && t.accountId === asset.id)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const symbolCurrencies: Record<string, string> = {};
            sortedTxs.forEach(t => { if (t.symbol && t.currency) symbolCurrencies[t.symbol] = t.currency; });

            const holdingQtys: Record<string, number> = {};
            let txIndex = 0;
            const fallbackBalance = currentBalances[asset.id] || 0;

            const chartPoints = dates.map(date => {
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
                    const symCurrency = symbolCurrencies[sym] || currentPrices[sym]?.currency || 'GBP';
                    const isUsd = symCurrency === 'USD';
                    const isGbx = symCurrency === 'GBX';
                    let fx = 1;
                    if (isUsd && gbpUsdRate > 0) fx = 1 / gbpUsdRate;
                    if (isGbx) price = price / 100;
                    val += qty * price * fx;
                });
                return { date: format(date, 'dd MMM'), value: val > 0 ? parseFloat(val.toFixed(2)) : fallbackBalance };
            });
            result[asset.id] = chartPoints;
        });
        return result;
    }, [investmentAssets, data.transactions, historicalPrices, currentPrices, currentBalances, gbpUsdRate]);

    const holdingSparklines = useMemo(() => {
        const result: Record<string, { date: string; value: number }[]> = {};
        holdings.forEach(h => {
            const today = new Date();
            const start = subMonths(today, 0.25);
            const dates = eachDayOfInterval({ start, end: today }).slice(-7);
            const hist = historicalPrices[h.symbol] || {};
            const isUsd = h.nativeCurrency === 'USD';
            const isGbx = h.nativeCurrency === 'GBX';
            let fx = 1;
            if (isUsd && gbpUsdRate > 0) fx = 1 / gbpUsdRate;
            result[h.symbol] = dates.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                let price = hist[dateStr] ?? h.nativePrice;
                if (isGbx) price = price / 100;
                return { date: format(date, 'dd'), value: parseFloat((h.quantity * price * fx).toFixed(2)) };
            });
        });
        return result;
    }, [holdings, historicalPrices, gbpUsdRate]);

    const closedSparklines = useMemo(() => {
        const result: Record<string, { date: string; value: number }[]> = {};
        closedHoldings.forEach(h => {
            const today = new Date();
            const start = subMonths(today, 0.25);
            const dates = eachDayOfInterval({ start, end: today }).slice(-7);
            const hist = historicalPrices[h.symbol] || {};
            const isGbx = h.nativeCurrency === 'GBX';
            const isUsd = h.nativeCurrency === 'USD';
            let fx = 1;
            if (isUsd && gbpUsdRate > 0) fx = 1 / gbpUsdRate;
            result[h.symbol] = dates.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                let price = hist[dateStr] ?? h.nativePrice;
                if (isGbx) price = price / 100;
                else price = price * fx;
                return { date: format(date, 'dd'), value: parseFloat(price.toFixed(2)) };
            });
        });
        return result;
    }, [closedHoldings, historicalPrices, gbpUsdRate]);

    // ── Investment Summary data ────────────────────────────────────────────────
    const totalInvested = activeHoldings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalProfitValue = activeHoldings.reduce((sum, h) => sum + h.profitValue, 0);
    const totalProfitPercent = totalInvested > 0 ? (totalProfitValue / totalInvested) * 100 : 0;
    const portfolioIsUp = totalProfitValue >= 0;
    const bestPerformer = activeHoldings.length > 0
        ? activeHoldings.reduce((best, h) => h.profitPercent > best.profitPercent ? h : best, activeHoldings[0])
        : null;

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="mb-4 mt-4">
                <div className="flex items-start justify-between">
                    <div>
                        <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Module</span>
                        <h2 className="text-4xl font-bold text-white tracking-tight mb-8">Investments</h2>
                        <span className="mb-4 font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Total Portfolio Value</span>
                        <p className={clsx(
                            "text-[6.5rem] font-black leading-none tracking-[-4px] text-white",
                            isPulsing && "animate-pulse-opacity"
                        )}>
                            {currencySymbol}{parseInt(pvInt.replace(/,/g, '')).toLocaleString()}
                            <span className="font-light opacity-30 text-[4rem] tracking-normal">.{pvDec}</span>
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 items-end">
                        <button
                            onClick={() => setIsAddAccountModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                        >
                            <Plus size={14} /> Add Account
                        </button>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-sm border border-white/5">
                               <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_8px] animate-pulse", loading ? "bg-yellow-400 shadow-yellow-400" : isStale ? "bg-red-500 shadow-red-500" : "bg-emerald-vein shadow-emerald-vein")} />
                               <span className={clsx("text-[10px] font-bold uppercase tracking-widest", isStale ? "text-red-400" : loading ? "text-yellow-400" : "text-white")}>
                                   {loading ? 'SYNCING...' : isStale ? 'OFFLINE' : 'LIVE'}
                               </span>
                            </div>
                            <span className="font-mono text-[10px] text-iron-dust">Updated {format(lastUpdated, 'HH:mm')}</span>
                            <button
                                onClick={() => refreshData()}
                                disabled={loading}
                                className={clsx("p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5", loading && "animate-spin cursor-not-allowed opacity-50")}
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Investment Summary ── */}
            {investmentAssets.length > 0 && (
                <div className="mb-10">
                    <div className="bg-[#161618] border border-white/5 rounded-sm p-6">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[3px] mb-5">Investment Summary</span>
                        <div className="grid grid-cols-3 gap-4">
                            {/* Total Invested */}
                            <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Total Invested</span>
                                <span className="text-lg font-bold text-white font-mono">
                                    {currencySymbol}{totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            {/* Total P/L with P/L% inline */}
                            <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Total P/L</span>
                                <span className={clsx('text-lg font-bold font-mono', portfolioIsUp ? 'text-emerald-vein' : 'text-magma')}>
                                    {portfolioIsUp ? '+' : ''}{currencySymbol}{Math.abs(totalProfitValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className={clsx('block text-[10px] font-mono mt-1', portfolioIsUp ? 'text-emerald-vein/70' : 'text-magma/70')}>
                                    {portfolioIsUp ? '+' : ''}{totalProfitPercent.toFixed(2)}%
                                </span>
                            </div>
                            {/* Accounts count */}
                            <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Accounts</span>
                                <span className="text-lg font-bold text-white font-mono">{investmentAssets.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Accounts */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold text-white uppercase tracking-[2px] flex items-center gap-2"><Wallet size={16} className="text-magma" />Accounts</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {investmentAssets.map(asset => {
                        const acctHoldings = holdings.filter(h => {
                          const holdingTx = data.transactions.find(t => t.symbol === h.symbol && t.type === 'investing' && t.accountId === asset.id);
                          return holdingTx !== undefined;
                        });
                        const balance = currentBalances[asset.id] || 0;
                        const acctTotalCost = acctHoldings.reduce((sum, h) => sum + h.totalCost, 0);
                        const acctTotalProfit = balance - acctTotalCost;
                        const acctProfitPercent = acctTotalCost > 0 ? (acctTotalProfit / acctTotalCost) * 100 : 0;
                        const acctUp = acctTotalProfit >= 0;
                        const acctChart = accountChartData[asset.id] || [];
                        const acctColor = '#3b82f6';
                        const acctMin = acctChart.length > 0 ? Math.min(...acctChart.map(d => d.value)) * 0.97 : 'auto';
                        const whole = Math.floor(balance).toLocaleString();
                        const pence = balance.toFixed(2).split('.')[1];

                        return (
                            <div key={asset.id} onClick={() => setSelectedAccount(asset)}
                                className="group bg-[#161618] border border-white/5 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer"
                                style={{ minHeight: 160 }}>
                                <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />
                                <div className="absolute bottom-0 right-0 pointer-events-none" style={{ width:'75%', height:'70%', opacity:0.75, maskImage:'linear-gradient(to right, transparent 0%, black 40%)', WebkitMaskImage:'linear-gradient(to right, transparent 0%, black 40%)' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={acctChart} margin={{ top:0, right:0, left:0, bottom:0 }}>
                                            <defs><linearGradient id={`acctGrad-${asset.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={acctColor} stopOpacity={0.22}/><stop offset="95%" stopColor={acctColor} stopOpacity={0}/></linearGradient></defs>
                                            <YAxis domain={[acctMin, 'auto']} hide />
                                            <Area type="monotone" dataKey="value" stroke={acctColor} strokeWidth={1.5} fill={`url(#acctGrad-${asset.id})`} dot={false} isAnimationActive={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="relative z-10 p-6">
                                    {/* Top row: icon + name/currency on left, institution badge on right */}
                                    <div className="flex justify-between items-start mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white/5 rounded-sm text-white shrink-0"><LineChartIcon size={18} /></div>
                                            <div>
                                                <h3 className="text-sm font-bold text-white leading-tight">{asset.name}</h3>
                                                <p className="text-[11px] text-iron-dust font-mono mt-0.5">{asset.currency}</p>
                                            </div>
                                        </div>
                                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase shrink-0 ml-3">{asset.institution}</span>
                                    </div>
                                    {/* Value — bigger font, lighter decimal */}
                                    <div className="text-4xl font-black text-white tracking-tight leading-none">
                                        {currencySymbol}{whole}<span className="text-2xl font-light opacity-30">.{pence}</span>
                                    </div>
                                    <div className={clsx('text-[10px] font-mono mt-1.5', acctUp ? 'text-emerald-vein' : 'text-magma')}>
                                        {acctUp ? '+' : ''}{currencySymbol}{Math.abs(acctTotalProfit).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})} ({acctTotalCost === 0 ? '+\u221e' : acctProfitPercent.toFixed(2)}%)
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Active Holdings */}
            <div className="mb-12">
                <h2 className="text-sm font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-vein" />Portfolio Holdings</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {activeHoldings.map(stock => {
                        const isProfit = stock.profitValue >= 0;
                        const nativeSymbol = getCurrencySymbol(stock.nativeCurrency);
                        const dayChange = stock.dailyChangePercent ?? 0;
                        const isDayUp = dayChange >= 0;
                        const sparkline = holdingSparklines[stock.symbol] || [];
                        const sparkFirst = sparkline[0]?.value ?? 0;
                        const sparkLast  = sparkline[sparkline.length - 1]?.value ?? 0;
                        const sparkColor = sparkLast >= sparkFirst ? '#00f2ad' : '#8e8e93';
                        const sparkMin   = sparkline.length > 0 ? Math.min(...sparkline.map(d => d.value)) * 0.98 : 'auto';
                        const abbrev     = tickerAbbrev(stock.symbol);
                        const displayName = toTitleCase(truncateName(stock.tickerName));

                        return (
                            <div key={stock.symbol} onClick={() => setSelectedHolding(stock)}
                                className="bg-[#161618] border border-white/5 p-5 rounded-sm relative hover:bg-white/[0.02] transition-colors group cursor-pointer flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex flex-col" style={{ minWidth: 44 }}>
                                            <div className="flex items-center justify-center bg-white/10 rounded-t-sm font-bold tracking-wider text-[11px] text-white px-2 py-2 leading-none">{abbrev}</div>
                                            <div className="h-px bg-white/20 w-full" />
                                            <div className="flex items-center justify-center bg-magma rounded-b-sm px-2 py-1 leading-none">
                                                <span className="text-[8px] font-mono font-bold text-black uppercase tracking-wider">{stock.nativeCurrency}</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0 pt-0.5">
                                            <h3 className="text-xs font-bold text-white leading-snug line-clamp-2" style={{ wordBreak:'break-word', overflowWrap:'break-word', hyphens:'none' }}>{displayName}</h3>
                                        </div>
                                    </div>
                                    <div className={clsx('flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5 shrink-0 ml-2', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                                        {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {stock.avgPrice === 0 ? '+\u221e' : stock.profitPercent.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="mb-2">
                                    <div className="text-2xl font-bold text-white tracking-tight">
                                        {currencySymbol}{Math.floor(stock.currentValue).toLocaleString()}<span className="text-base font-light opacity-40">.{stock.currentValue.toFixed(2).split('.')[1]}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[9px] font-mono text-iron-dust uppercase tracking-widest">Market Value</p>
                                        <span className={clsx('text-[8px] font-mono font-bold px-1 py-0.5 rounded', isDayUp ? 'bg-emerald-vein/10 text-emerald-vein' : 'bg-magma/10 text-magma')}>{isDayUp ? '+' : ''}{dayChange.toFixed(2)}%</span>
                                    </div>
                                </div>
                                <div className="h-[40px] w-full my-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sparkline} margin={{ top:2, right:2, left:2, bottom:2 }}>
                                            <YAxis domain={[sparkMin, 'auto']} hide />
                                            <Line type="monotone" dataKey="value" stroke={sparkColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-white/5 pt-3 mt-auto">
                                    <div><span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Shares</span><span className="font-mono text-[10px] text-white">{stock.quantity.toFixed(8)}</span></div>
                                    <div className="text-right"><span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Price</span><span className="font-mono text-[10px] text-white">{stock.nativeCurrency === 'GBX' ? `${stock.nativePrice.toFixed(2)}p` : `${nativeSymbol}${stock.nativePrice.toFixed(2)}`}</span></div>
                                    <div><span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Avg Cost</span><span className="font-mono text-[10px] text-white">{currencySymbol}{stock.avgPrice.toFixed(2)}</span></div>
                                    <div className="text-right"><span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">P/L</span><span className={clsx('font-mono text-[10px]', isProfit ? 'text-emerald-vein' : 'text-magma')}>{isProfit ? '+' : ''}{currencySymbol}{(Math.floor(Math.abs(stock.profitValue)*100)/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Closed Positions */}
            {closedHoldings.length > 0 && (
                <div>
                    <button onClick={() => setClosedOpen(p => !p)}
                        className="flex items-center gap-2 text-sm font-bold text-iron-dust uppercase tracking-[2px] mb-4 hover:text-white transition-colors w-full text-left">
                        {closedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <TrendingDown size={16} className="text-iron-dust" />
                        Closed Positions
                        <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 bg-white/5 rounded text-iron-dust">{closedHoldings.length}</span>
                    </button>
                    {closedOpen && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {closedHoldings.map(stock => {
                                const isProfit = stock.profitValue >= 0;
                                const nativeSymbol = getCurrencySymbol(stock.nativeCurrency);
                                const sparkline = closedSparklines[stock.symbol] || [];
                                const sparkFirst = sparkline[0]?.value ?? 0;
                                const sparkLast  = sparkline[sparkline.length - 1]?.value ?? 0;
                                const sparkColor = sparkLast >= sparkFirst ? '#00f2ad' : '#8e8e93';
                                const sparkMin   = sparkline.length > 0 ? Math.min(...sparkline.map(d => d.value)) * 0.98 : 'auto';
                                const abbrev     = tickerAbbrev(stock.symbol);
                                const displayName = toTitleCase(truncateName(stock.tickerName));
                                return (
                                    <div key={stock.symbol} onClick={() => setSelectedHolding(stock)}
                                        className="bg-[#161618] border border-white/5 p-4 rounded-sm relative hover:bg-white/[0.02] transition-colors cursor-pointer flex flex-col opacity-70 hover:opacity-100">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col" style={{ minWidth: 38 }}>
                                                    <div className="flex items-center justify-center bg-white/10 rounded-t-sm font-bold tracking-wider text-[10px] text-white px-2 py-1.5 leading-none">{abbrev}</div>
                                                    <div className="h-px bg-white/20 w-full" />
                                                    <div className="flex items-center justify-center bg-magma rounded-b-sm px-2 py-0.5 leading-none">
                                                        <span className="text-[8px] font-mono font-bold text-black uppercase tracking-wider">{stock.nativeCurrency}</span>
                                                    </div>
                                                </div>
                                                <div><span className="text-xs font-bold text-white block leading-none">{displayName}</span></div>
                                            </div>
                                            <div className={clsx('flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                                                {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                {stock.avgPrice === 0 ? '+\u221e' : stock.profitPercent.toFixed(1)}%
                                            </div>
                                        </div>
                                        <div className="h-[32px] w-full my-1">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={sparkline} margin={{ top:1, right:1, left:1, bottom:1 }}>
                                                    <YAxis domain={[sparkMin, 'auto']} hide />
                                                    <Line type="monotone" dataKey="value" stroke={sparkColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="grid grid-cols-3 gap-x-3 border-t border-white/5 pt-2 mt-1">
                                            <div><span className="block text-[7px] text-iron-dust uppercase tracking-wider mb-0.5">Price</span><span className="font-mono text-[9px] text-white">{stock.nativeCurrency === 'GBX' ? `${stock.nativePrice.toFixed(2)}p` : `${nativeSymbol}${stock.nativePrice.toFixed(2)}`}</span></div>
                                            <div><span className="block text-[7px] text-iron-dust uppercase tracking-wider mb-0.5">Avg Cost</span><span className="font-mono text-[9px] text-white">{currencySymbol}{stock.avgPrice.toFixed(2)}</span></div>
                                            <div className="text-right"><span className="block text-[7px] text-iron-dust uppercase tracking-wider mb-0.5">P/L</span><span className={clsx('font-mono text-[9px]', isProfit ? 'text-emerald-vein' : 'text-magma')}>{isProfit ? '+' : ''}{currencySymbol}{(Math.floor(Math.abs(stock.profitValue)*100)/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <AddAccountModal isOpen={isAddAccountModalOpen} onClose={() => setIsAddAccountModalOpen(false)} defaultType="investment" />
            <HoldingDetailModal isOpen={!!selectedHolding} onClose={() => setSelectedHolding(null)} holding={selectedHolding} />
            <InvestmentAccountModal isOpen={!!selectedAccount} onClose={() => setSelectedAccount(null)} account={selectedAccount} />
        </div>
    );
};
