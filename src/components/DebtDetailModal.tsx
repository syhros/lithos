import React, { useMemo } from 'react';
import { X, CreditCard, Landmark, Tag, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Debt, Transaction } from '../data/mockData';
import { differenceInMonths, parseISO, format } from 'date-fns';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';

interface DebtDetailModalProps {
  debt: Debt;
  balance: number;
  currencySymbol: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}

const calcMinPayment = (debt: Debt, balance: number): number =>
  debt.minPaymentType === 'percentage' ? (balance * debt.minPaymentValue) / 100 : debt.minPaymentValue;

const calcMonthlyInterest = (balance: number, apr: number): number =>
  (balance * apr) / 100 / 12;

const calcPayoffMonths = (balance: number, monthlyPayment: number, apr: number): number | null => {
  if (monthlyPayment <= 0 || balance <= 0) return null;
  const monthlyRate = apr / 100 / 12;
  if (monthlyRate === 0) return Math.ceil(balance / monthlyPayment);
  const interestThisMonth = balance * monthlyRate;
  if (monthlyPayment <= interestThisMonth) return null;
  return Math.ceil(Math.log(monthlyPayment / (monthlyPayment - interestThisMonth)) / Math.log(1 + monthlyRate));
};

export const DebtDetailModal: React.FC<DebtDetailModalProps> = ({ debt, balance, currencySymbol, onClose, onEdit, onDelete }) => {
  const { data, deleteDebt } = useFinance();

  const isPromoActive = debt.promo ? new Date() < parseISO(debt.promo.promoEndDate) : false;
  const activeApr = isPromoActive ? debt.promo!.promoApr : debt.apr;
  const minPayment = calcMinPayment(debt, balance);
  const monthlyInterest = calcMonthlyInterest(balance, activeApr);
  const utilization = debt.limit > 0 ? (balance / debt.limit) * 100 : 0;
  const payoffMonths = calcPayoffMonths(balance, minPayment, activeApr);

  let promoShortfall: number | null = null;
  let promoMonthsLeft: number | null = null;
  let promoProgress = 0;
  if (debt.promo && isPromoActive) {
    promoMonthsLeft = differenceInMonths(parseISO(debt.promo.promoEndDate), new Date());
    if (promoMonthsLeft < 1) promoMonthsLeft = 1;
    const projectedBalance = balance - (minPayment * promoMonthsLeft);
    promoShortfall = projectedBalance > 0 ? projectedBalance : 0;
    const totalPaid = Math.min(minPayment * promoMonthsLeft, balance);
    promoProgress = balance > 0 ? (totalPaid / balance) * 100 : 100;
  }

  // Transactions posted to this debt account
  const transactions = useMemo(() => {
    return (data?.transactions || [])
      .filter(t => t.accountId === debt.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [data?.transactions, debt.id]);

  const totalCharged = useMemo(() => transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalPaid    = useMemo(() => transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), [transactions]);

  const Icon = debt.type === 'credit_card' ? CreditCard : Landmark;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-3xl rounded-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/5 rounded-sm text-white"><Icon size={18} /></div>
            <div>
              <h3 className="text-sm font-bold text-white">{debt.name}</h3>
              <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">
                {debt.type.replace('_', ' ')}
                {isPromoActive && <span className="ml-2 text-emerald-vein">\u2022 Promo Active</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-0.5">Current Balance</span>
              <span className="text-2xl font-bold text-white tracking-tight">{currencySymbol}{balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <button onClick={onClose} className="text-iron-dust hover:text-white transition-colors ml-2"><X size={18} /></button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">

          {/* Utilization bar */}
          <div>
            <div className="flex justify-between text-[10px] font-mono text-iron-dust uppercase mb-1.5">
              <span>Utilization</span>
              <span className={utilization > 30 ? 'text-magma' : 'text-emerald-vein'}>{utilization.toFixed(1)}% of {currencySymbol}{debt.limit.toLocaleString()}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', utilization > 30 ? 'bg-magma' : 'bg-emerald-vein')} style={{ width: `${Math.min(utilization, 100)}%` }} />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">{isPromoActive ? 'Promo APR' : 'APR'}</span>
              <span className={clsx('text-xl font-bold font-mono', isPromoActive ? 'text-emerald-vein' : 'text-white')}>{activeApr}%</span>
              {isPromoActive && <span className="block text-[10px] font-mono text-iron-dust mt-0.5">Standard: {debt.apr}%</span>}
            </div>
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Min Payment</span>
              <span className="text-xl font-bold font-mono text-white">{currencySymbol}{minPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="block text-[10px] font-mono text-iron-dust mt-0.5">{debt.minPaymentType === 'percentage' ? `${debt.minPaymentValue}% of balance` : 'Fixed amount'}</span>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Monthly Interest</span>
              <span className={clsx('text-xl font-bold font-mono', monthlyInterest > 0 ? 'text-magma' : 'text-emerald-vein')}>{currencySymbol}{monthlyInterest.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="block text-[10px] font-mono text-iron-dust mt-0.5">{activeApr}% APR / 12</span>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Payoff</span>
              {payoffMonths === null
                ? <span className="text-sm font-bold font-mono text-magma">\u221e</span>
                : <><span className="text-xl font-bold font-mono text-white">{payoffMonths}</span><span className="text-[10px] font-mono text-iron-dust ml-1">mo</span></>}
            </div>
          </div>

          {/* Promo Section */}
          {debt.promo && (
            <div className={clsx('border rounded-sm p-5', isPromoActive ? 'border-emerald-vein/30 bg-emerald-vein/5' : 'border-white/5 bg-black/20')}>
              <div className="flex items-center gap-2 mb-4">
                <Tag size={14} className={isPromoActive ? 'text-emerald-vein' : 'text-iron-dust'} />
                <span className={clsx('text-[10px] font-mono uppercase tracking-[2px] font-bold', isPromoActive ? 'text-emerald-vein' : 'text-iron-dust')}>
                  {isPromoActive ? 'Promotional Offer Active' : 'Promotional Offer Expired'}
                </span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-iron-dust font-mono">{debt.promo.promoApr}% APR until {format(parseISO(debt.promo.promoEndDate), 'd MMM yyyy')}</span>
                {promoMonthsLeft !== null && <span className="text-white font-mono font-bold">{promoMonthsLeft} months left</span>}
              </div>
              {isPromoActive && promoMonthsLeft !== null && (
                <>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mt-3 mb-3">
                    <div className={clsx('h-full rounded-full transition-all', promoShortfall === 0 ? 'bg-emerald-vein' : 'bg-amber-400')} style={{ width: `${Math.min(promoProgress, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono mb-3">
                    <span className="text-iron-dust">Projected paid at min: {currencySymbol}{(minPayment * promoMonthsLeft).toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span>
                    <span className={promoShortfall === 0 ? 'text-emerald-vein' : 'text-amber-400'}>{promoShortfall === 0 ? 'Paid off in time' : `Shortfall: ${currencySymbol}${promoShortfall.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`}</span>
                  </div>
                  {promoShortfall !== null && promoShortfall > 0 && (
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-sm p-3">
                      <p className="text-[10px] text-amber-400 font-mono">To clear before {format(parseISO(debt.promo.promoEndDate), 'MMM yyyy')}, pay <strong>{currencySymbol}{(balance / promoMonthsLeft).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month</strong>. Rate reverts to {debt.apr}% APR after promo ends.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Payoff projection */}
          <div className="bg-black/30 border border-white/5 rounded-sm p-5">
            <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Pay Off Projection</span>
            {payoffMonths === null
              ? <p className="text-sm text-magma font-mono">Min payment does not cover interest — balance will grow indefinitely.</p>
              : (
                <>
                  <div className="flex items-end gap-3 mb-1">
                    <span className="text-3xl font-bold text-white">{payoffMonths}</span>
                    <span className="text-sm text-iron-dust mb-1">months (~{Math.ceil(payoffMonths / 12)} yr{Math.ceil(payoffMonths / 12) !== 1 ? 's' : ''})</span>
                  </div>
                  <p className="text-[10px] font-mono text-iron-dust">At {currencySymbol}{minPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month with {activeApr}% APR. Total interest: <span className="text-magma">{currencySymbol}{Math.max(0, (minPayment * payoffMonths) - balance).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                </>
              )
            }
          </div>

          {/* Summary strip */}
          {transactions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Charged (shown)</span>
                <span className="text-sm font-bold text-magma">+{currencySymbol}{totalCharged.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                <span className="block text-[9px] text-iron-dust uppercase tracking-wider mb-1">Paid (shown)</span>
                <span className="text-sm font-bold text-emerald-vein">-{currencySymbol}{totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Recent Transactions</h3>
            <div className="space-y-1">
              {transactions.length === 0 && (
                <p className="text-xs font-mono text-iron-dust py-4 text-center">No transactions found for this account.</p>
              )}
              {transactions.map(tx => (
                <div key={tx.id} className="flex justify-between items-center p-4 bg-[#161618] border border-white/5 rounded-sm hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center border', tx.amount > 0 ? 'border-magma/20 text-magma' : 'border-emerald-vein/20 text-emerald-vein')}>
                      {tx.amount > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{tx.description}</p>
                      <p className="text-[9px] font-mono text-iron-dust uppercase">{tx.category} \u00b7 {format(new Date(tx.date), 'dd MMM yyyy')}</p>
                    </div>
                  </div>
                  <span className={clsx('text-xs font-mono font-bold', tx.amount > 0 ? 'text-magma' : 'text-emerald-vein')}>
                    {tx.amount > 0 ? '+' : '-'}{currencySymbol}{Math.abs(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-[#131517] flex justify-between gap-3 flex-shrink-0">
          <div className="flex gap-3">
            <button onClick={() => { if (confirm('Are you sure you want to delete this debt?')) { deleteDebt(debt.id); if (onDelete) onDelete(); onClose(); } }} className="flex items-center gap-2 px-4 py-2.5 bg-red-900/10 border border-red-900/30 text-red-400 text-xs font-bold uppercase rounded-sm hover:bg-red-900/20 transition-colors">
              <Trash2 size={13} /> Delete
            </button>
            <button onClick={onEdit} className="px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">Edit</button>
          </div>
          <button onClick={onClose} className="px-6 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};
