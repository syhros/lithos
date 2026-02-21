import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Plus, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { AddAccountModal } from '../components/AddAccountModal';
import { AccountDetailModal } from '../components/AccountDetailModal';
import { Asset } from '../data/mockData';
import { format, parseISO } from 'date-fns';

export const Accounts: React.FC = () => {
    const { data, currentBalances, currencySymbol, loading, sortOrders } = useFinance();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);
    const [closedExpanded, setClosedExpanded] = useState(false);

    const sortOrder = sortOrders.accounts;

    const liquidAssets = data?.assets?.filter(a => (a.type === 'checking' || a.type === 'savings') && !a.isClosed) || [];
    const closedAssets = data?.assets?.filter(a => (a.type === 'checking' || a.type === 'savings') && a.isClosed) || [];

    const sortAssets = (assets: Asset[]) => {
        if (sortOrder === 'az') return [...assets].sort((a, b) => a.name.localeCompare(b.name));
        if (sortOrder === 'highest') return [...assets].sort((a, b) => (currentBalances[b.id] || 0) - (currentBalances[a.id] || 0));
        return assets;
    };
    const sortedLiquidAssets = sortAssets(liquidAssets);

    const totalAssets = Object.entries(currentBalances)
        .filter(([id]) => (data?.assets || []).some(a => a.id === id && !a.isClosed && (a.type === 'checking' || a.type === 'savings')))
        .reduce((sum, [, v]) => sum + v, 0);
    const totalChecking = Object.entries(currentBalances)
        .filter(([id]) => (data?.assets || []).some(a => a.id === id && a.type === 'checking' && !a.isClosed))
        .reduce((sum, [, v]) => sum + v, 0);
    const totalSavings = Object.entries(currentBalances)
        .filter(([id]) => (data?.assets || []).some(a => a.id === id && a.type === 'savings' && !a.isClosed))
        .reduce((sum, [, v]) => sum + v, 0);
    const monthlySaving = (data?.transactions || [])
        .filter(t => t.type === 'transfer' && t.category === 'Savings')
        .slice(-30)
        .reduce((sum, t) => sum + t.amount, 0);
    const estMonthlyInterest = liquidAssets.filter(a => a.type === 'savings')
        .reduce((sum, a) => sum + (a.interestRate ? ((currentBalances[a.id] || 0) * (a.interestRate / 100)) / 12 : 0), 0);
    const checkSavingsRatio = totalSavings > 0 ? ((totalChecking / totalSavings) * 100).toFixed(1) + '%' : '\u2014';

    const AccountTile = ({ asset }: { asset: Asset }) => {
        const balance = currentBalances[asset.id] || 0;
        const change = balance - asset.startingValue;
        const changePercent = asset.startingValue > 0 ? (change / asset.startingValue) * 100 : 0;
        const isPositive = change >= 0;
        const whole = Math.floor(Math.abs(balance)).toLocaleString();
        const pence = balance.toFixed(2).split('.')[1];
        const isSavings = asset.type === 'savings';
        return (
            <div key={asset.id} onClick={() => setSelectedAccount(asset)} className="group bg-[#161618] border border-white/5 p-6 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer">
                <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />
                <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/5 rounded-sm text-white shrink-0"><Wallet size={18} /></div>
                        <div>
                            <h3 className="text-sm font-bold text-white leading-tight">{asset.name}</h3>
                            <p className="text-[11px] text-iron-dust font-mono mt-0.5">{asset.institution}</p>
                        </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 ml-3">
                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">{asset.currency}</span>
                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">{asset.type}</span>
                    </div>
                </div>
                <div className="mb-3">
                    <div className="text-4xl font-black text-white tracking-tight leading-none">
                        {currencySymbol}{whole}<span className="text-2xl font-light opacity-30">.{pence}</span>
                    </div>
                    {isSavings ? (
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className={clsx('text-[11px] font-mono', isPositive ? 'text-emerald-vein' : 'text-magma')}>
                                {isPositive ? '+' : ''}{currencySymbol}{Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({changePercent.toFixed(2)}%)
                            </span>
                            {asset.interestRate && <span className="text-[11px] font-mono text-emerald-vein">{asset.interestRate}% APR</span>}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    };

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up relative overflow-y-auto custom-scrollbar">
            <div className="flex items-end justify-between mb-8">
                <div>
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Accounts</h1>
                </div>
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"><Plus size={14} /> Add Account</button>
            </div>
            {liquidAssets.length > 0 && (
                <div className="bg-[#161618] border border-white/5 rounded-sm p-6 mb-10">
                    <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[3px] mb-5">Account Summary</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {[['Total Assets', totalAssets, true], ['Total Checking', totalChecking, true], ['Total Savings', totalSavings, true], ['Monthly Saving', monthlySaving, true, monthlySaving > 0 ? 'text-emerald-vein' : ''], ['Est. Monthly Interest', estMonthlyInterest, true, estMonthlyInterest > 0 ? 'text-emerald-vein' : ''], ['Checking / Savings', null, false]].map(([label, val, isMoney, color]: any) => (
                            <div key={label} className="bg-black/30 rounded-sm p-4 border border-white/5">
                                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">{label}</span>
                                <span className={clsx('text-lg font-bold font-mono', color || 'text-white')}>
                                    {isMoney ? `${currencySymbol}${val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : checkSavingsRatio}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {liquidAssets.length === 0 ? (
                <div className="col-span-full py-20 text-center border border-dashed border-white/10 rounded-sm bg-white/[0.02] mb-12">
                    <p className="text-iron-dust font-mono text-sm mb-4">No accounts yet</p>
                    <button onClick={() => setShowAddModal(true)} className="inline-block px-4 py-2 bg-magma/20 border border-magma/30 text-magma text-xs font-bold uppercase rounded-sm hover:bg-magma/30 transition-colors">Create Your First Account</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                    {sortedLiquidAssets.map(asset => <AccountTile key={asset.id} asset={asset} />)}
                </div>
            )}
            {closedAssets.length > 0 && (
                <div className="mt-4">
                    <button onClick={() => setClosedExpanded(!closedExpanded)} className="flex items-center gap-3 text-iron-dust hover:text-white transition-colors mb-4">
                        {closedExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <span className="text-sm font-mono uppercase tracking-[2px]">Closed Accounts ({closedAssets.length})</span>
                    </button>
                    {closedExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {closedAssets.map(asset => (
                                <div key={asset.id} onClick={() => setSelectedAccount(asset)} className="group bg-[#161618] border border-white/5 p-6 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer opacity-75">
                                    <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />
                                    <div className="flex justify-between items-start mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white/5 rounded-sm text-white shrink-0"><Wallet size={18} /></div>
                                            <div><h3 className="text-sm font-bold text-white leading-tight">{asset.name}</h3><p className="text-[11px] text-iron-dust font-mono mt-0.5">{asset.institution}</p></div>
                                        </div>
                                        <span className="px-2 py-1 bg-red-900/20 text-red-400 rounded text-[10px] font-mono uppercase shrink-0 ml-3">Closed</span>
                                    </div>
                                    {asset.closedDate && <div className="text-[11px] text-iron-dust font-mono">Closed {format(parseISO(asset.closedDate), 'MMM yyyy')}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <AddAccountModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <AccountDetailModal isOpen={!!selectedAccount} onClose={() => setSelectedAccount(null)} account={selectedAccount} />
        </div>
    );
};
