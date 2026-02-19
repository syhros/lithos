
import React, { useMemo, useState } from 'react';
import { useFinance, USD_TO_GBP, getCurrencySymbol } from '../context/FinanceContext';
import { LineChart as LineChartIcon, Wallet, TrendingUp, TrendingDown, Plus, RefreshCw } from 'lucide-react';
import { differenceInMinutes } from 'date-fns';
import { clsx } from 'clsx';
import { AreaChart, Area, YAxis, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, subMonths, eachDayOfInterval, isBefore, parseISO, addDays, differenceInMinutes } from 'date-fns';
import { AddAccountModal } from '../components/AddAccountModal';
import { HoldingDetailModal } from '../components/HoldingDetailModal';
import { InvestmentAccountModal } from '../components/InvestmentAccountModal';
import { Asset } from '../data/mockData';

export const Investments: React.FC = () => {
    const { data, currentBalances, currentPrices, historicalPrices, getHistory, currencySymbol, lastUpdated, refreshData, loading } = useFinance();
    const userCurrency = data.user.currency;
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [selectedHolding, setSelectedHolding] = useState<any>(null);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);

    const minsSinceUpdate = differenceInMinutes(new Date(), lastUpdated);
    const isStale = minsSinceUpdate > 5;

    const investmentAssets = data.assets.filter(a => a.type === 'investment');

    const holdings = useMemo(() => {
        const map = new Map<string, { symbol: string; quantity: number; totalCost: number }>();

        data.transactions.forEach(tx => {
            if (tx.type === 'investing' && tx.symbol && tx.quantity) {
                const current = map.get(tx.symbol) || { symbol: tx.symbol, quantity: 0, totalCost: 0 };
                const isSell = tx.category === 'Sell';

                if (isSell) {
                  // For sells, reduce both quantity and cost proportionally
                  if (current.quantity > 0) {
                    const costPerShare = current.totalCost / current.quantity;
                    current.totalCost -= tx.quantity * costPerShare;
                  }
                  current.quantity += tx.quantity; // quantity is negative for sells
                } else {
                  // For buys and dividend reinvestments, add both quantity and cost (use absolute value)
                  current.quantity += tx.quantity;
                  current.totalCost += Math.abs(tx.amount);
                }

                map.set(tx.symbol, current);
            }
        });

        return Array.from(map.values()).map(h => {
            const marketData = currentPrices[h.symbol];
            const nativeCurrency = marketData?.currency || data.transactions.find(t => t.symbol === h.symbol && t.currency)?.currency || 'GBP';
            const stockIsUsd = nativeCurrency === 'USD';
            const userIsUsd = userCurrency === 'USD';

            let fxRate = 1;
            if (stockIsUsd && !userIsUsd) fxRate = USD_TO_GBP;
            if (!stockIsUsd && userIsUsd) fxRate = 1 / USD_TO_GBP;

            const nativePrice = marketData ? marketData.price : 0;
            const displayPrice = nativePrice * fxRate;
            const currentValue = h.quantity * displayPrice;
            const avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
            const profitValue = currentValue - h.totalCost;
            const profitPercent = h.totalCost > 0 ? (profitValue / h.totalCost) * 100 : 0;

            return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue, avgPrice, profitValue, profitPercent, marketData, fxRate };
        }).sort((a, b) => b.currentValue - a.currentValue);
    }, [data.transactions, currentPrices]);

    const portfolioValue = holdings.reduce((acc, curr) => acc + curr.currentValue, 0);

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

            const sortedTxs = data.transactions
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
                    const price = hist[dateStr] ?? currentPrices[sym]?.price ?? 0;
                    const isUsd = symbolCurrencies[sym] === 'USD';
                    val += qty * price * (isUsd ? USD_TO_GBP : 1);
                });

                return { date: format(date, 'dd MMM'), value: val > 0 ? parseFloat(val.toFixed(2)) : fallbackBalance };
            });

            result[asset.id] = chartPoints;
        });
        return result;
    }, [investmentAssets, data.transactions, historicalPrices, currentPrices, currentBalances]);

    const holdingSparklines = useMemo(() => {
        const result: Record<string, { date: string; value: number }[]> = {};
        holdings.forEach(h => {
            const today = new Date();
            const start = subMonths(today, 0.25);
            const dates = eachDayOfInterval({ start, end: today }).slice(-7);
            const hist = historicalPrices[h.symbol] || {};
            const isUsd = h.nativeCurrency === 'USD';
            const fx = isUsd ? USD_TO_GBP : 1;

            result[h.symbol] = dates.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const price = hist[dateStr] ?? h.nativePrice;
                return { date: format(date, 'dd'), value: parseFloat((h.quantity * price * fx).toFixed(2)) };
            });
        });
        return result;
    }, [holdings, historicalPrices]);

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
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => setIsAddAccountModalOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                        >
                            <Plus size={14} />
                            Add Account
                        </button>
                        <div className="flex items-center gap-2 px-3 py-2">
                            <button
                                onClick={() => refreshData()}
                                disabled={loading}
                                className={clsx("p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white border border-white/5", loading && "animate-spin cursor-not-allowed opacity-50")}
                            >
                                <RefreshCw size={14} />
                            </button>
                            <div className="text-[10px] font-mono text-iron-dust">
                                Updated {format(lastUpdated, 'HH:mm')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 1: Accounts — 2 wide with 1M chart */}

            <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold text-white uppercase tracking-[2px] flex items-center gap-2">
                        <Wallet size={16} className="text-magma" />
                        Accounts
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {investmentAssets.map(asset => {
                        const balance = currentBalances[asset.id] || 0;
                        const acctChart = accountChartData[asset.id] || [];
                        const acctFirst = acctChart[0]?.value ?? 0;
                        const acctLast = acctChart[acctChart.length - 1]?.value ?? 0;
                        const acctUp = acctLast >= acctFirst;
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

                                {/* Background chart — full tile, fades in left-to-right via CSS mask */}
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

                                {/* Content */}
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
                                    <p className="text-xs text-iron-dust font-mono mb-4">{asset.currency} · ISA</p>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        {currencySymbol}{whole}<span className="text-xl font-light opacity-40">.{pence}</span>
                                    </div>
                                    <div className={clsx('text-[10px] font-mono mt-1.5', acctUp ? 'text-emerald-vein' : 'text-magma')}>
                                        {acctUp ? '+' : ''}{acctFirst > 0 ? (((acctLast - acctFirst) / acctFirst) * 100).toFixed(2) : '0.00'}% (1M)
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Section 2: Holdings — 4 wide with sparklines */}
            <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-vein" />
                    Portfolio Holdings
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {holdings.map((stock) => {
                        const isProfit = stock.profitValue >= 0;
                        const nativeSymbol = getCurrencySymbol(stock.nativeCurrency);
                        const dayChange = stock.marketData?.changePercent ?? 0;
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
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-white uppercase tracking-wider" style={{ backgroundColor: '#e85d04' }}>
                                                {stock.nativeCurrency}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={clsx('flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                                        {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                        {stock.profitPercent.toFixed(1)}%
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
                                        <span className="font-mono text-[10px] text-white">{stock.quantity.toFixed(3)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[8px] text-iron-dust uppercase tracking-wider mb-0.5">Price</span>
                                        <span className="font-mono text-[10px] text-white">{nativeSymbol}{stock.nativePrice.toFixed(2)}</span>
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
