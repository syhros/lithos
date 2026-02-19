import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Plus, Wallet } from 'lucide-react';
import { AddAccountModal } from '../components/AddAccountModal';
import { AccountDetailModal } from '../components/AccountDetailModal';
import { Asset } from '../data/mockData';

export const Accounts: React.FC = () => {
    const { data, currentBalances, currencySymbol, loading } = useFinance();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Asset | null>(null);

    // Filter for Checking and Savings
    const liquidAssets = data?.assets?.filter(a => a.type === 'checking' || a.type === 'savings') || [];

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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liquidAssets.map(asset => {
                    const balance = currentBalances[asset.id] || 0;
                    return (
                        <div key={asset.id} onClick={() => setSelectedAccount(asset)} className="group bg-[#161618] border border-white/5 p-8 rounded-sm relative overflow-hidden transition-all hover:border-white/10 hover:-translate-y-1 cursor-pointer">
                            <div className="absolute left-0 bottom-0 w-[2px] h-0 group-hover:h-full transition-all duration-500 ease-out" style={{ backgroundColor: asset.color }} />
                            
                            <div className="flex justify-between items-start mb-8">
                                <div className="p-3 bg-white/5 rounded-sm text-white">
                                    <Wallet size={20} />
                                </div>
                                <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-iron-dust uppercase">
                                    {asset.type}
                                </span>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">{asset.name}</h3>
                                <p className="text-xs text-iron-dust font-mono mb-6">{asset.institution}</p>
                                <div className="text-3xl font-bold text-white tracking-tight">
                                    {currencySymbol}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <AddAccountModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <AccountDetailModal
                isOpen={!!selectedAccount}
                onClose={() => setSelectedAccount(null)}
                account={selectedAccount}
            />
        </div>
    );
};