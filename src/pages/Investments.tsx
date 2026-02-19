
import React, { useMemo, useState } from 'react';
import { useFinance, USD_TO_GBP } from '../context/FinanceContext';
import { LineChart, Wallet, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { AddAccountModal } from '../components/AddAccountModal';
import { HoldingDetailModal } from '../components/HoldingDetailModal';

export const Investments: React.FC = () => {
    const { data, currentBalances, currentPrices } = useFinance();
    const userCurrency = data.user.currency;
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [selectedHolding, setSelectedHolding] = useState<any>(null);
    
    // Filter for Investment Accounts
    const investmentAssets = data.assets.filter(a => a.type === 'investment');

    // --- Holdings Calculation Logic ---
    const holdings = useMemo(() => {
        const map = new Map<string, {
            symbol: string;
            quantity: number;
            totalCost: number;
        }>();

        // 1. Aggregate Buys/Sells
        data.transactions.forEach(tx => {
            if (tx.type === 'investing' && tx.symbol && tx.quantity) {
                const current = map.get(tx.symbol) || { symbol: tx.symbol, quantity: 0, totalCost: 0 };
                
                // Assuming 'amount' is cost basis (positive for buys in this mock)
                current.quantity += tx.quantity;
                current.totalCost += tx.amount; 
                
                map.set(tx.symbol, current);
            }
        });

        // 2. Calculate Derived Metrics using LIVE prices with FX conversion
        return Array.from(map.values()).map(h => {
            const marketData = currentPrices[h.symbol];
            const nativeCurrency = marketData?.currency || data.transactions.find(t => t.symbol === h.symbol && t.currency)?.currency || 'GBP';
            const stockIsUsd = nativeCurrency === 'USD';
            const userIsUsd = userCurrency === 'USD';

            // FX rate to convert stock price to user's display currency
            let fxRate = 1;
            if (stockIsUsd && !userIsUsd) fxRate = USD_TO_GBP;
            if (!stockIsUsd && userIsUsd) fxRate = 1 / USD_TO_GBP;

            const nativePrice = marketData ? marketData.price : 0;
            const displayPrice = nativePrice * fxRate;
            const currentValue = h.quantity * displayPrice;
            const avgPrice = h.quantity > 0 ? h.totalCost / h.quantity : 0;
            const profitValue = currentValue - h.totalCost;
            const profitPercent = h.totalCost > 0 ? (profitValue / h.totalCost) * 100 : 0;

            return {
                ...h,
                nativeCurrency,
                nativePrice,
                displayPrice,
                currentValue,
                avgPrice,
                profitValue,
                profitPercent,
                marketData,
                fxRate
            };
        }).sort((a, b) => b.currentValue - a.currentValue);
    }, [data.transactions, currentPrices]);

    const portfolioValue = holdings.reduce((acc, curr) => acc + curr.currentValue, 0);
    const userCurrencySymbol = userCurrency === 'USD' ? '$' : '£';

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-start justify-between mb-12 mt-4">
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px]">Total Portfolio Value</span>
                    </div>
                    <h1 className="text-[6.5rem] font-black leading-none tracking-[-4px] text-white">
                        {userCurrencySymbol}{parseInt(portfolioValue.toString()).toLocaleString()}
                        <span className="font-light opacity-30 text-[4rem] tracking-normal">.{portfolioValue.toFixed(2).split('.')[1]}</span>
                    </h1>
                </div>
                <button
                    onClick={() => setIsAddAccountModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                >
                    <Plus size={14} />
                    Add Account
                </button>
            </div>

            {/* Section 1: Accounts */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold text-white uppercase tracking-[2px] flex items-center gap-2">
                        <Wallet size={16} className="text-magma" />
                        Accounts
                    </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {investmentAssets.map(asset => {
                        const balance = currentBalances[asset.id] || 0;
                        return (
                            <div key={asset.id} className="group bg-[#161618] border border-white/5 p-8 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1">
                                <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />
                                
                                <div className="flex justify-between items-start mb-8">
                                    <div className="p-3 bg-white/5 rounded-sm text-white">
                                        <LineChart size={20} />
                                    </div>
                                    <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
                                        {asset.institution}
                                    </span>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">{asset.name}</h3>
                                    <p className="text-xs text-iron-dust font-mono mb-6">{asset.currency} • ISA</p>
                                    <div className="text-3xl font-bold text-white tracking-tight">
                                        £{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Section 2: Holdings */}
            <div>
                 <h2 className="text-sm font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2">
                    <TrendingUp size={16} className="text-emerald-vein" />
                    Portfolio Holdings
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {holdings.map((stock) => {
                        const isProfit = stock.profitValue >= 0;
                        const nativeSymbol = stock.nativeCurrency === 'USD' ? '$' : '£';
                        const dayChange = stock.marketData?.changePercent ?? 0;
                        const isDayUp = dayChange >= 0;
                        return (
                            <div
                                key={stock.symbol}
                                onClick={() => setSelectedHolding(stock)}
                                className="bg-[#161618] border border-white/5 p-6 rounded-sm relative hover:bg-white/[0.02] transition-colors group cursor-pointer"
                            >
                                {/* Header: Symbol + Name */}
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white font-bold tracking-wider text-xs border border-white/5">
                                            {stock.symbol.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white leading-none">{stock.symbol}</h3>
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white uppercase tracking-wider" style={{ backgroundColor: '#e85d04' }}>
                                                {stock.nativeCurrency}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={clsx("flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded bg-white/5", isProfit ? "text-emerald-vein" : "text-magma")}>
                                        {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {stock.profitPercent.toFixed(2)}%
                                    </div>
                                </div>

                                {/* Main Value (Big) */}
                                <div className="mb-6">
                                    <div className="text-4xl font-bold text-white tracking-tight">
                                        {userCurrencySymbol}{stock.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        <span className="text-lg text-iron-dust opacity-50">.{(stock.currentValue % 1).toFixed(2).substring(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[10px] font-mono text-iron-dust uppercase tracking-widest">Market Value</p>
                                        <span className={clsx(
                                            "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded",
                                            isDayUp ? "bg-emerald-vein/10 text-emerald-vein" : "bg-magma/10 text-magma"
                                        )}>
                                            {isDayUp ? '+' : ''}{dayChange.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>

                                {/* Detailed Stats Grid (Small Mono) */}
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8 border-t border-white/5 pt-4">
                                    <div>
                                        <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Shares Held</span>
                                        <span className="font-mono text-xs text-white">{stock.quantity.toFixed(4)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Avg Price</span>
                                        <span className="font-mono text-xs text-white">{userCurrencySymbol}{stock.avgPrice.toFixed(2)}</span>
                                    </div>

                                    <div>
                                        <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Current Price ({stock.nativeCurrency})</span>
                                        <span className="font-mono text-xs text-white">{nativeSymbol}{stock.nativePrice.toFixed(2)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Profit/Loss</span>
                                        <span className={clsx("font-mono text-xs", isProfit ? "text-emerald-vein" : "text-magma")}>
                                            {isProfit ? '+' : ''}{userCurrencySymbol}{stock.profitValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                defaultType="investing"
            />
            
            <HoldingDetailModal
                isOpen={!!selectedHolding}
                onClose={() => setSelectedHolding(null)}
                holding={selectedHolding}
            />
        </div>
    );
};
