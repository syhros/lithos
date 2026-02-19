import React from 'react';
import { useFinance } from '../context/FinanceContext';
import { CreditCard, AlertCircle } from 'lucide-react';

export const Debts: React.FC = () => {
    const { data, currentBalances, currencySymbol } = useFinance();
    const debts = data.debts;

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
             <div className="mb-12">
                <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                <h1 className="text-4xl font-bold text-white tracking-tight">Debts & Liabilities</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {debts.map(debt => {
                    const balance = currentBalances[debt.id] || 0;
                    const utilization = (balance / debt.limit) * 100;
                    
                    return (
                        <div key={debt.id} className="bg-[#161618] border border-white/5 p-8 rounded-sm relative overflow-hidden group">
                             <div className="absolute left-0 bottom-0 w-[4px] h-full bg-magma/10" />
                             
                             <div className="flex justify-between items-start mb-8 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white/5 rounded-sm text-white">
                                        <CreditCard size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{debt.name}</h3>
                                        <p className="text-xs text-iron-dust font-mono">{debt.type.replace('_', ' ').toUpperCase()}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="block text-3xl font-bold text-white tracking-tight">{currencySymbol}{balance.toLocaleString()}</span>
                                    <span className="text-xs text-iron-dust font-mono">of {currencySymbol}{debt.limit.toLocaleString()} limit</span>
                                </div>
                             </div>

                             <div className="relative z-10">
                                 <div className="flex justify-between text-[10px] font-mono text-iron-dust uppercase mb-2">
                                     <span>Utilization</span>
                                     <span className={utilization > 30 ? 'text-magma' : 'text-emerald-vein'}>{utilization.toFixed(1)}%</span>
                                 </div>
                                 <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                     <div 
                                        className={`h-full ${utilization > 30 ? 'bg-magma' : 'bg-emerald-vein'}`} 
                                        style={{ width: `${utilization}%` }}
                                     />
                                 </div>
                                 
                                 <div className="mt-6 flex gap-8">
                                     <div>
                                         <span className="block text-[10px] text-iron-dust uppercase font-bold mb-1">APR</span>
                                         <span className="text-sm text-white font-mono">{debt.apr}%</span>
                                     </div>
                                     <div>
                                         <span className="block text-[10px] text-iron-dust uppercase font-bold mb-1">Min Payment</span>
                                         <span className="text-sm text-white font-mono">{currencySymbol}{debt.minPayment}</span>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};