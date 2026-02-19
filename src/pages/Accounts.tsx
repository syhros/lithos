import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Plus, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { AddAccountModal } from '../components/AddAccountModal';
import { AccountDetailModal } from '../components/AccountDetailModal';
import { Asset } from '../data/mockData';
import { format, parseISO } from 'date-fns';

export const Accounts: React.FC = () => {
    const { data, currentBalances, currencySymbol, loading } = useFinance();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);
    const [closedExpanded, setClosedExpanded] = useState(false);

    const liquidAssets = data?.assets?.filter(a => (a.type === 'checking' || a.type === 'savings') && !a.isClosed) || [];
    const closedAssets = data?.assets?.filter(a => (a.type === 'checking' || a.type === 'savings') && a.isClosed) || [];

    const AccountTile = ({ asset }: { asset: Asset }) => {
        const balance = currentBalances[asset.id] || 0;
        const change = balance - asset.startingValue;
        const changePercent = asset.startingValue > 0 ? (change / asset.startingValue) * 100 : 0;
        const isPositive = change >= 0;

        return (
            <div key={asset.id} onClick={() => setSelectedAccount(asset)} className="group bg-[#161618] border border-white/5 p-8 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer">
                <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />

                <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-white/5 rounded-sm text-white">
                        <Wallet size={20} />
                    </div>
                    <div className="flex gap-2">
                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
                            {asset.currency}
                        </span>
                        <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
                            {asset.type}
                        </span>
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-lg font-bold text-white mb-1">{asset.name}</h3>
                    <p className="text-xs text-iron-dust font-mono">{asset.institution}</p>
                </div>

                <div className="mb-4">
                    <div className="text-3xl font-bold text-white tracking-tight mb-3">
                        {currencySymbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={clsx('text-[11px] font-mono', isPositive ? 'text-emerald-vein' : 'text-magma')}>
                        {isPositive ? '+' : ''}{currencySymbol}{Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({changePercent.toFixed(2)}%)
                    </div>
                </div>

                {asset.interestRate && (
                    <div className="text-[11px] text-emerald-vein font-mono uppercase mb-2">
                        {asset.interestRate}% APY
                    </div>
                )}

                {asset.openedDate && (
                    <div className="text-[11px] text-iron-dust font-mono">
                        Opened {format(parseISO(asset.openedDate), 'MMM yyyy')}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up relative overflow-y-auto custom-scrollbar">
            <div className="flex items-end justify-between mb-12">
                <div>
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Accounts</h1>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                >
                    <Plus size={14} />
                    Add Account
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {liquidAssets.map(asset => <AccountTile key={asset.id} asset={asset} />)}
            </div>

            {closedAssets.length > 0 && (
                <div className="mt-4">
                    <button
                        onClick={() => setClosedExpanded(!closedExpanded)}
                        className="flex items-center gap-3 text-iron-dust hover:text-white transition-colors mb-4"
                    >
                        {closedExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        <span className="text-sm font-mono uppercase tracking-[2px]">
                            Closed Accounts ({closedAssets.length})
                        </span>
                    </button>

                    {closedExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {closedAssets.map(asset => (
                                <div key={asset.id} onClick={() => setSelectedAccount(asset)} className="group bg-[#161618] border border-white/5 p-8 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer opacity-75">
                                    <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />

                                    <div className="flex justify-between items-start mb-6">
                                        <div className="p-3 bg-white/5 rounded-sm text-white">
                                            <Wallet size={20} />
                                        </div>
                                        <span className="px-2 py-1 bg-red-900/20 text-red-400 rounded text-[10px] font-mono uppercase">
                                            Closed
                                        </span>
                                    </div>

                                    <div className="mb-6">
                                        <h3 className="text-lg font-bold text-white mb-1">{asset.name}</h3>
                                        <p className="text-xs text-iron-dust font-mono">{asset.institution}</p>
                                    </div>

                                    {asset.closedDate && (
                                        <div className="text-[11px] text-iron-dust font-mono">
                                            Closed {format(parseISO(asset.closedDate), 'MMM yyyy')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <AddAccountModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <AccountDetailModal
                isOpen={!!selectedAccount}
                onClose={() => setSelectedAccount(null)}
                account={selectedAccount}
            />
        </div>
    );
};