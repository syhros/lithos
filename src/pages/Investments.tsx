import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useFinance, getCurrencySymbol } from '../context/FinanceContext';
import { LineChart as LineChartIcon, Wallet, TrendingUp, TrendingDown, Plus, RefreshCw, Database, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { AreaChart, Area, YAxis, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, subMonths, eachDayOfInterval, isBefore, parseISO, addDays, differenceInMinutes, subDays } from 'date-fns';
import { AddAccountModal } from '../components/AddAccountModal';
import { HoldingDetailModal } from '../components/HoldingDetailModal';
import { InvestmentAccountModal } from '../components/InvestmentAccountModal';
import { Asset } from '../data/mockData';
import { supabase } from '../lib/supabase';

type LogLine = {
    id: number;
    symbol: string;
    status: 'pending' | 'pulling' | 'done' | 'error';
    rows?: number;
    message?: string;
    fromDate?: string;
};

export const Investments: React.FC = () => {
    const { data, currentBalances, currentPrices, historicalPrices, getHistory, currencySymbol, lastUpdated, refreshData, loading, gbpUsdRate } = useFinance();
    const userCurrency = data?.user?.currency || 'GBP';
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [selectedHolding, setSelectedHolding] = useState<any>(null);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);

    // Historic pull state
    const [isPulling, setIsPulling] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [logLines, setLogLines] = useState<LogLine[]>([]);
    const [pullComplete, setPullComplete] = useState(false);
    const logRef = useRef<HTMLDivElement>(null);
    const logIdRef = useRef(0);

    const minsSinceUpdate = differenceInMinutes(new Date(), lastUpdated);
    const isStale = minsSinceUpdate > 5;

    const investmentAssets = data?.assets?.filter(a => a.type === 'investment') || [];

    const holdings = useMemo(() => {
        const map = new Map<string, { symbol: string; quantity: number; totalCost: number; currency: string }>();

        (data?.transactions || []).forEach(tx => {
            if (tx.type === 'investing' && tx.symbol && tx.quantity) {
                const current = map.get(tx.symbol) || { symbol: tx.symbol, quantity: 0, totalCost: 0, currency: tx.currency || 'GBP' };
                const isSell = tx.category === 'Sell';

                if (isSell) {
                  if (current.quantity > 0) {
                    const costPerShare = current.totalCost / current.quantity;
                    current.totalCost -= tx.quantity * costPerShare;
                  }
                  current.quantity += tx.quantity;
                } else {
                  current.quantity += tx.quantity;
                  current.totalCost += Math.abs(tx.amount);
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

            let nativePrice = marketData ? marketData.price : 0;
            let displayPrice = nativePrice;
            if (stockIsGbx) {
              displayPrice = nativePrice / 100;
            } else {
              displayPrice = nativePrice * fxRate;
            }

            const currentValue = h.quantity * displayPrice;
            const avgPriceCost = h.quantity > 0 ? h.totalCost / h.quantity : 0;
            const profitValue = currentValue - h.totalCost;
            const isZeroCost = h.totalCost === 0;
            const profitPercent = isZeroCost ? 0 : (h.totalCost > 0 ? (profitValue / h.totalCost) * 100 : 0);

            const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
            const today = format(new Date(), 'yyyy-MM-dd');
            const history = historicalPrices[h.symbol] || {};
            const yesterdayPrice = history[yesterday] || history[today] || nativePrice;
            const todayPrice = history[today] || nativePrice;
            const dailyChangePercent = yesterdayPrice > 0 ? ((todayPrice - yesterdayPrice) / yesterdayPrice) * 100 : 0;

            return {
                ...h,
                nativeCurrency,
                nativePrice,
                displayPrice,
                currentValue,
                avgPrice: avgPriceCost,
                profitValue,
                profitPercent,
                isZeroCost,
                marketData,
                fxRate,
                dailyChangePercent
            };
        }).sort((a, b) => b.currentValue - a.currentValue);
    }, [data.transactions, currentPrices, gbpUsdRate, userCurrency]);

    // Auto-scroll log to bottom
    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logLines]);

    const updateLine = (id: number, update: Partial<LogLine>) => {
        setLogLines(prev => prev.map(l => l.id === id ? { ...l, ...update } : l));
    };

    const handlePullHistoricData = async () => {
        if (isPulling) return;

        const transactions = data?.transactions || [];

        // Build a map of symbol -> earliest transaction date
        const firstTxDate = new Map<string, string>();
        transactions
            .filter(t => t.type === 'investing' && t.symbol && t.date)
            .forEach(t => {
                const existing = firstTxDate.get(t.symbol!);
                if (!existing || t.date < existing) {
                    firstTxDate.set(t.symbol!, t.date);
                }
            });

        const symbols = Array.from(firstTxDate.keys());
        if (symbols.length === 0) return;

        setIsPulling(true);
        setPullComplete(false);
        setShowLog(true);

        // Build initial log lines — all pending, show from date
        const initialLines: LogLine[] = symbols.map(sym => ({
            id: ++logIdRef.current,
            symbol: sym,
            status: 'pending',
            fromDate: firstTxDate.get(sym),
        }));
        setLogLines(initialLines);

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

        // Process one symbol at a time so we can show live progress
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const lineId = initialLines[i].id;
            const fromDate = firstTxDate.get(symbol)!;

            updateLine(lineId, { status: 'pulling' });

            try {
                const res = await fetch(
                    `${supabaseUrl}/functions/v1/backfill-price-history?symbols=${encodeURIComponent(symbol)}&from=${fromDate}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                if (!res.ok) {
                    updateLine(lineId, { status: 'error', message: `HTTP ${res.status}` });
                } else {
                    const json = await res.json();
                    const result = json?.summary?.[symbol];
                    if (result?.error) {
                        updateLine(lineId, { status: 'error', message: result.error });
                    } else {
                        updateLine(lineId, { status: 'done', rows: result?.rows ?? 0 });
                    }
                }
            } catch (e: any) {
                updateLine(lineId, { status: 'error', message: e.message || 'Network error' });
            }
        }

        setIsPulling(false);
        setPullComplete(true);

        // Refresh market data after backfill
        await refreshData();
    };

    const portfolioValue = investmentAssets.reduce((acc, asset) => acc + (currentBalances[asset.id] || 0), 0);

    const portfolioChartData = useMemo(() => {
        const history = getHistory('1M');
        return history.map(p => ({ date: p.date, value: p.investing }));
    }, [getHistory]);

    const portfolioFirstVal = portfolioChartData[0]?.value ?? 0;
    const portfolioLastVal = portfolioChartData[portfolioChartData.length - 1]?.value ?? 0;
    const portfolioUp = portfolioLastVal >= portfolioFirstVal;

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
                    let fxRate = 1;
                    if (isUsd && gbpUsdRate > 0) fxRate = 1 / gbpUsdRate;
                    if (isGbx) price = price / 100;
                    val += qty * price * fxRate;
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

    const doneCount = logLines.filter(l => l.status === 'done').length;
    const errorCount = logLines.filter(l => l.status === 'error').length;
    const totalCount = logLines.length;

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="mb-4 mt-4">
                <div className="flex items-start justify-between">
                    <div>
                        <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Module</span>
                        <h2 className="text-4xl font-bold text-white tracking-tight mb-8">Investments</h2>
                        <span className="mb-4 font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-1">Total Portfolio Value</span>
                        <p className="text-[6.5rem] font-black leading-none tracking-[-4px] text-white">
                            {currencySymbol}{parseInt(portfolioValue.toString()).toLocaleString()}
                            <span className="font-light opacity-30 text-[4rem] tracking-normal">.{portfolioValue.toFixed(2).split('.')[1]}</span>
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 items-end">
                        <button
                            onClick={() => setIsAddAccountModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                        >
                            <Plus size={14} />
                            Add Account
                        </button>

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

                        {/* Pull Historic Data button */}
                        <button
                            onClick={handlePullHistoricData}
                            disabled={isPulling}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider border transition-all',
                                isPulling
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-not-allowed'
                                    : pullComplete
                                    ? 'bg-emerald-vein/10 border-emerald-vein/30 text-emerald-vein hover:bg-emerald-vein/20'
                                    : 'bg-white/5 border-white/10 text-iron-dust hover:text-white hover:border-white/20'
                            )}
                        >
                            {isPulling
                                ? <Loader2 size={12} className="animate-spin" />
                                : pullComplete
                                ? <CheckCircle2 size={12} />
                                : <Database size={12} />}
                            {isPulling ? 'Pulling...' : pullComplete ? 'Pull Complete' : 'Pull Historic Data'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Historic Pull Log Panel */}
            {showLog && (
                <div className="mb-8 bg-[#0d0f10] border border-white/10 rounded-sm overflow-hidden">
                    {/* Log header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#131517]">
                        <div className="flex items-center gap-3">
                            <Database size={13} className="text-blue-400" />
                            <span className="text-[11px] font-bold text-white uppercase tracking-[2px]">Historic Price Pull</span>
                            {totalCount > 0 && (
                                <span className="text-[10px] font-mono text-iron-dust">
                                    {doneCount + errorCount} / {totalCount} tickers
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {pullComplete && (
                                <span className="text-[10px] font-mono text-emerald-vein">
                                    {doneCount} succeeded {errorCount > 0 ? `· ${errorCount} failed` : ''}
                                </span>
                            )}
                            <button
                                onClick={() => setShowLog(false)}
                                className="text-iron-dust hover:text-white text-xs transition-colors"
                            >✕</button>
                        </div>
                    </div>

                    {/* Progress bar */}
                    {totalCount > 0 && (
                        <div className="h-0.5 bg-white/5">
                            <div
                                className="h-full transition-all duration-500"
                                style={{
                                    width: `${((doneCount + errorCount) / totalCount) * 100}%`,
                                    backgroundColor: pullComplete ? (errorCount === 0 ? '#00f2ad' : '#f97316') : '#3b82f6'
                                }}
                            />
                        </div>
                    )}

                    {/* Scrollable log */}
                    <div
                        ref={logRef}
                        className="max-h-[220px] overflow-y-auto custom-scrollbar p-4 space-y-1 font-mono text-[11px]"
                    >
                        {logLines.map(line => (
                            <div key={line.id} className={clsx(
                                'flex items-center gap-3 py-0.5 transition-all',
                                line.status === 'pulling' && 'text-blue-400',
                                line.status === 'done' && 'text-emerald-vein',
                                line.status === 'error' && 'text-magma',
                                line.status === 'pending' && 'text-iron-dust/40',
                            )}>
                                <span className="w-4 flex-shrink-0">
                                    {line.status === 'pending' && <span className="opacity-30">·</span>}
                                    {line.status === 'pulling' && <Loader2 size={11} className="animate-spin" />}
                                    {line.status === 'done' && <CheckCircle2 size={11} />}
                                    {line.status === 'error' && <XCircle size={11} />}
                                </span>
                                <span className="w-24 flex-shrink-0 font-bold tracking-wider">{line.symbol}</span>
                                <span className="text-current opacity-80">
                                    {line.status === 'pending' && `Waiting... (from ${line.fromDate})`}
                                    {line.status === 'pulling' && `Pulling from ${line.fromDate}…`}
                                    {line.status === 'done' && `Complete — ${line.rows?.toLocaleString()} rows cached`}
                                    {line.status === 'error' && `Failed — ${line.message}`}
                                </span>
                            </div>
                        ))}
                        {pullComplete && (
                            <div className="pt-2 border-t border-white/5 mt-2 text-emerald-vein">
                                ✓ All tickers processed. Refreshing data...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Section 1: Accounts */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold text-white uppercase tracking-[2px] flex items-center gap-2">
                        <Wallet size={16} className="text-magma" />
                        Accounts
                    </h2>
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
                            <div
                                key={asset.id}
                                onClick={() => setSelectedAccount(asset)}
                                className="group bg-[#161618] border border-white/5 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer"
                                style={{ minHeight: 160 }}
                            >
                                <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />

                                <div
                                    className="absolute bottom-0 right-0 pointer-events-none"
                                    style={{ width: '75%', height: '70%', opacity: 0.75, maskImage: 'linear-gradient(to right, transparent 0%, black 40%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)' }}
                                >
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={acctChart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id={`acctGrad-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={acctColor} stopOpacity={0.22} />
                                                    <stop offset="95%" stopColor={acctColor} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <YAxis domain={[acctMin, 'auto']} hide={true} />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={acctColor}
                                                strokeWidth={1.5}
                                                fill={`url(#acctGrad-${asset.id})`}
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="relative z-10 p-8">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="p-3 bg-white/5 rounded-sm text-white">
                                            <LineChartIcon size={20} />
                                        </div>
                                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
                                            {asset.institution}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-1">{asset.name}</h3>
                                    <p className="text-xs text-iron-dust font-mono mb-4">{asset.currency}</p>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {currencySymbol}{whole}<span className="text-xl font-light opacity-40">.{pence}</span>
                                    </div>
                                    <div className={clsx('text-[10px] font-mono mt-1.5', acctUp ? 'text-emerald-vein' : 'text-magma')}>
                                        {acctUp ? '+' : ''}{currencySymbol}{Math.abs(acctTotalProfit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({acctTotalCost === 0 ? '+∞' : acctProfitPercent.toFixed(2)}%)
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Section 2: Portfolio Holdings */}
            <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-vein" />
                    Portfolio Holdings
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {holdings.map((stock) => {
                        const isProfit = stock.profitValue >= 0;
                        const nativeSymbol = getCurrencySymbol(stock.nativeCurrency);
                        const dayChange = stock.dailyChangePercent ?? 0;
                        const isDayUp = dayChange >= 0;
                        const sparkline = holdingSparklines[stock.symbol] || [];
                        const sparkFirst = sparkline[0]?.value ?? 0;
                        const sparkLast = sparkline[sparkline.length - 1]?.value ?? 0;
                        const sparkUp = sparkLast >= sparkFirst;
                        const sparkColor = sparkUp ? '#00f2ad' : '#8e8e93';
                        const sparkMin = sparkline.length > 0 ? Math.min(...sparkline.map(d => d.value)) * 0.98 : 'auto';

                        return (
                            <div
                                key={stock.symbol}
                                onClick={() => setSelectedHolding(stock)}
                                className="bg-[#161618] border border-white/5 p-5 rounded-sm relative hover:bg-white/[0.02] transition-colors group cursor-pointer flex flex-col"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 bg-white/5 rounded-full flex items-center justify-center text-white font-bold tracking-wider text-xs border border-white/5">
                                            {stock.symbol.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white leading-none">{stock.symbol}</h3>
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-black uppercase tracking-wider" style={{ backgroundColor: '#e85d04' }}>
                                                {stock.nativeCurrency}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={clsx('flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                                        {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {stock.avgPrice === 0 ? '+∞' : stock.profitPercent.toFixed(1)}%
                                    </div>
                                </div>

                                <div className="mb-2">
                                    <div className="text-2xl font-bold text-white tracking-tight">
                                        {currencySymbol}{Math.floor(stock.currentValue).toLocaleString()}<span className="text-base font-light opacity-40">.{stock.currentValue.toFixed(2).split('.')[1]}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[9px] font-mono text-iron-dust uppercase tracking-widest">Market Value</p>
                                        <span className={clsx('text-[8px] font-mono font-bold px-1 py-0.5 rounded', isDayUp ? 'bg-emerald-vein/10 text-emerald-vein' : 'bg-magma/10 text-magma')}>
                                            {isDayUp ? '+' : ''}{dayChange.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>

                                {/* Sparkline 7-day */}
                                <div className="h-[40px] w-full my-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                            <YAxis domain={[sparkMin, 'auto']} hide={true} />
                                            <Line type="monotone" dataKey="value" stroke={sparkColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-white/5 pt-3 mt-auto">
                                    <div>
                                        <span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Shares</span>
                                        <span className="font-mono text-[10px] text-white">{stock.quantity.toFixed(8)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Price</span>
                                        <span className="font-mono text-[10px] text-white">
                                          {stock.nativeCurrency === 'GBX'
                                            ? `${stock.nativePrice.toFixed(2)}p`
                                            : `${nativeSymbol}${stock.nativePrice.toFixed(2)}`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Avg Cost</span>
                                        <span className="font-mono text-[10px] text-white">{currencySymbol}{stock.avgPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">P/L</span>
                                        <span className={clsx('font-mono text-[10px]', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                                            {isProfit ? '+' : ''}{currencySymbol}{(Math.floor(Math.abs(stock.profitValue) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <AddAccountModal
                isOpen={isAddAccountModalOpen}
                onClose={() => setIsAddAccountModalOpen(false)}
                defaultType="investment"
            />

            <HoldingDetailModal
                isOpen={!!selectedHolding}
                onClose={() => setSelectedHolding(null)}
                holding={selectedHolding}
            />

            <InvestmentAccountModal
                isOpen={!!selectedAccount}
                onClose={() => setSelectedAccount(null)}
                account={selectedAccount}
            />
        </div>
    );
};
