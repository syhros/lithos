import React, { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { CreditCard, Landmark, Plus, Tag } from 'lucide-react';
import { AddAccountModal } from '../components/AddAccountModal';
import { DebtDetailModal } from '../components/DebtDetailModal';
import { Debt } from '../data/mockData';
import { parseISO, format, differenceInMonths } from 'date-fns';
import { clsx } from 'clsx';

const calcMinPayment = (debt: Debt, balance: number): number => {
    if (debt.minPaymentType === 'percentage') {
        return (balance * debt.minPaymentValue) / 100;
    }
    return debt.minPaymentValue;
};

const calcMonthlyInterest = (balance: number, apr: number): number => {
    return (balance * apr) / 100 / 12;
};

export const Debts: React.FC = () => {
    const { data, currentBalances, currencySymbol, loading } = useFinance();
    const debts = data?.debts || [];
    const [showAddDebt, setShowAddDebt] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
    const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

    const totalAssets = Object.entries(currentBalances)
        .filter(([id]) => (data?.assets || []).some(a => a.id === id))
        .reduce((sum, [, v]) => sum + v, 0);

    const totalDebt = debts.reduce((sum, d) => sum + (currentBalances[d.id] || 0), 0);
    const totalLimit = debts.reduce((sum, d) => sum + d.limit, 0);
    const totalUtilization = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;
    const totalMinPayment = debts.reduce((sum, d) => sum + calcMinPayment(d, currentBalances[d.id] || 0), 0);
    const totalMonthlyInterest = debts.reduce((sum, d) => {
        const balance = currentBalances[d.id] || 0;
        const isPromoActive = d.promo ? new Date() < parseISO(d.promo.promoEndDate) : false;
        const apr = isPromoActive ? d.promo!.promoApr : d.apr;
        return sum + calcMonthlyInterest(balance, apr);
    }, 0);
    const debtToAssetRatio = totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0;

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Debts & Liabilities</h1>
                </div>
                <button
                    onClick={() => setShowAddDebt(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                >
                    <Plus size={14} />
                    Add Debt
                </button>
            </div>

            {/* Total Credit Summary — moved to top */}
            <div className="bg-[#161618] border border-white/5 rounded-sm p-6 mb-10">
                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[3px] mb-5">Total Credit Summary</span>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Total Used</span>
                        <span className="text-lg font-bold text-white font-mono">
                            {currencySymbol}{totalDebt.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Total Limit</span>
                        <span className="text-lg font-bold text-white font-mono">
                            {currencySymbol}{totalLimit.toLocaleString()}
                        </span>
                    </div>
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Utilization</span>
                        <span className={clsx('text-lg font-bold font-mono', totalUtilization > 30 ? 'text-magma' : 'text-emerald-vein')}>
                            {totalUtilization.toFixed(1)}%
                        </span>
                    </div>
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Total Min Payment</span>
                        <span className="text-lg font-bold text-white font-mono">
                            {currencySymbol}{totalMinPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Est. Monthly Interest</span>
                        <span className={clsx('text-lg font-bold font-mono', totalMonthlyInterest > 0 ? 'text-magma' : 'text-emerald-vein')}>
                            {currencySymbol}{totalMonthlyInterest.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="bg-black/30 rounded-sm p-4 border border-white/5">
                        <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-wider mb-2">Debt / Asset Ratio</span>
                        <span className={clsx('text-lg font-bold font-mono', debtToAssetRatio > 50 ? 'text-magma' : debtToAssetRatio > 20 ? 'text-amber-400' : 'text-emerald-vein')}>
                            {debtToAssetRatio.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Debt Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {debts.map(debt => {
                    const balance = currentBalances[debt.id] || 0;
                    const utilization = debt.limit > 0 ? (balance / debt.limit) * 100 : 0;
                    const isPromoActive = debt.promo ? new Date() < parseISO(debt.promo.promoEndDate) : false;
                    const activeApr = isPromoActive ? debt.promo!.promoApr : debt.apr;
                    const minPayment = calcMinPayment(debt, balance);
                    const monthlyInterest = calcMonthlyInterest(balance, activeApr);
                    const promoMonthsLeft = (debt.promo && isPromoActive)
                        ? Math.max(1, differenceInMonths(parseISO(debt.promo.promoEndDate), new Date()))
                        : null;
                    const promoShortfall = promoMonthsLeft !== null
                        ? Math.max(0, balance - minPayment * promoMonthsLeft)
                        : null;
                    const promoProgress = (promoMonthsLeft !== null && balance > 0)
                        ? Math.min(100, (Math.min(minPayment * promoMonthsLeft, balance) / balance) * 100)
                        : 0;

                    const Icon = debt.type === 'credit_card' ? CreditCard : Landmark;

                    return (
                        <div
                            key={debt.id}
                            onClick={() => setSelectedDebt(debt)}
                            className="bg-[#161618] border border-white/5 p-7 rounded-sm relative overflow-hidden group cursor-pointer hover:border-white/10 transition-all"
                        >
                            <div className="absolute left-0 top-0 w-[3px] h-full bg-magma/30" />

                            {/* Promo badge */}
                            {isPromoActive && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-emerald-vein/10 border border-emerald-vein/30 rounded-sm px-2 py-1">
                                    <Tag size={10} className="text-emerald-vein" />
                                    <span className="text-[10px] font-mono font-bold text-emerald-vein uppercase tracking-wider">
                                        {debt.promo!.promoApr}% Until {format(parseISO(debt.promo!.promoEndDate), 'MMM yy')}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-white/5 rounded-sm text-white">
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white">{debt.name}</h3>
                                        <p className="text-[10px] text-iron-dust font-mono uppercase tracking-wider">
                                            {debt.type.replace('_', ' ')}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right" style={{ marginTop: isPromoActive ? '28px' : '0' }}>
                                    <span className="block text-2xl font-bold text-white tracking-tight">
                                        {currencySymbol}{balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] text-iron-dust font-mono">of {currencySymbol}{debt.limit.toLocaleString()} limit</span>
                                </div>
                            </div>

                            {/* Utilization bar */}
                            <div className="relative z-10 mb-5">
                                <div className="flex justify-between text-[10px] font-mono text-iron-dust uppercase mb-1.5">
                                    <span>Utilization</span>
                                    <span className={utilization > 30 ? 'text-magma' : 'text-emerald-vein'}>{utilization.toFixed(1)}%</span>
                                </div>
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={clsx('h-full rounded-full transition-all', utilization > 30 ? 'bg-magma' : 'bg-emerald-vein')}
                                        style={{ width: `${Math.min(utilization, 100)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Promo progress bar */}
                            {isPromoActive && promoMonthsLeft !== null && (
                                <div className="relative z-10 mb-5">
                                    <div className="flex justify-between text-[10px] font-mono text-iron-dust uppercase mb-1.5">
                                        <span>Promo payoff progress</span>
                                        <span className={promoShortfall === 0 ? 'text-emerald-vein' : 'text-amber-400'}>
                                            {promoShortfall === 0
                                                ? 'On track'
                                                : `${currencySymbol}${(promoShortfall ?? 0).toLocaleString('en-GB', { maximumFractionDigits: 0 })} shortfall`
                                            }
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={clsx('h-full rounded-full transition-all', promoShortfall === 0 ? 'bg-emerald-vein' : 'bg-amber-400')}
                                            style={{ width: `${promoProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] font-mono text-iron-dust mt-1">{promoMonthsLeft} months left on offer</p>
                                </div>
                            )}

                            {/* Stats row */}
                            <div className="relative z-10 flex gap-6 flex-wrap">
                                <div>
                                    <span className="block text-[10px] text-iron-dust uppercase font-bold mb-1">APR</span>
                                    <span className={clsx('text-sm font-mono font-bold', isPromoActive ? 'text-emerald-vein' : 'text-white')}>
                                        {activeApr}%
                                        {isPromoActive && <span className="text-iron-dust font-normal ml-1">({debt.apr}% std)</span>}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-[10px] text-iron-dust uppercase font-bold mb-1">Min Payment</span>
                                    <span className="text-sm text-white font-mono">
                                        {currencySymbol}{minPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        {debt.minPaymentType === 'percentage' && (
                                            <span className="text-iron-dust text-[10px] ml-1">({debt.minPaymentValue}%)</span>
                                        )}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-[10px] text-iron-dust uppercase font-bold mb-1">Monthly Interest</span>
                                    <span className={clsx('text-sm font-mono', monthlyInterest > 0 ? 'text-magma' : 'text-emerald-vein')}>
                                        {currencySymbol}{monthlyInterest.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {debts.length === 0 && (
                    <div className="col-span-2 text-center py-20 text-iron-dust font-mono text-sm">
                        No debts recorded. Add one to start tracking.
                    </div>
                )}
            </div>

            <AddAccountModal
                isOpen={showAddDebt || editingDebt !== null}
                onClose={() => {
                    setShowAddDebt(false);
                    setEditingDebt(null);
                }}
                mode="debt"
                debtToEdit={editingDebt || undefined}
            />

            {selectedDebt && (
                <DebtDetailModal
                    debt={selectedDebt}
                    balance={currentBalances[selectedDebt.id] || 0}
                    currencySymbol={currencySymbol}
                    onClose={() => setSelectedDebt(null)}
                    onEdit={() => {
                        setEditingDebt(selectedDebt);
                        setSelectedDebt(null);
                    }}
                />
            )}
        </div>
    );
};
