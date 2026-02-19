import React from 'react';
import { X, CreditCard, Landmark, Tag } from 'lucide-react';
import { Debt } from '../data/mockData';
import { differenceInMonths, parseISO, format } from 'date-fns';
import { clsx } from 'clsx';

interface DebtDetailModalProps {
  debt: Debt;
  balance: number;
  currencySymbol: string;
  onClose: () => void;
}

const calcMinPayment = (debt: Debt, balance: number): number => {
  if (debt.minPaymentType === 'percentage') {
    return (balance * debt.minPaymentValue) / 100;
  }
  return debt.minPaymentValue;
};

const calcMonthlyInterest = (balance: number, apr: number): number => {
  return (balance * apr) / 100 / 12;
};

const calcPayoffMonths = (balance: number, monthlyPayment: number, apr: number): number | null => {
  if (monthlyPayment <= 0 || balance <= 0) return null;
  const monthlyRate = apr / 100 / 12;
  if (monthlyRate === 0) {
    return Math.ceil(balance / monthlyPayment);
  }
  const interestThisMonth = balance * monthlyRate;
  if (monthlyPayment <= interestThisMonth) return null;
  const n = Math.log(monthlyPayment / (monthlyPayment - interestThisMonth)) / Math.log(1 + monthlyRate);
  return Math.ceil(n);
};

export const DebtDetailModal: React.FC<DebtDetailModalProps> = ({ debt, balance, currencySymbol, onClose }) => {
  const isPromoActive = debt.promo
    ? new Date() < parseISO(debt.promo.promoEndDate)
    : false;

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
    const totalPayable = balance;
    const totalPaid = Math.min(minPayment * promoMonthsLeft, balance);
    promoProgress = totalPayable > 0 ? (totalPaid / totalPayable) * 100 : 100;
  }

  const Icon = debt.type === 'credit_card' ? CreditCard : Landmark;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-lg rounded-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/5 rounded-sm text-white">
              <Icon size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{debt.name}</h3>
              <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">
                {debt.type.replace('_', ' ')}
                {isPromoActive && <span className="ml-2 text-emerald-vein">• Promo Active</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-iron-dust hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {/* Balance & Utilization */}
          <div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1">Current Balance</span>
                <span className="text-4xl font-bold text-white tracking-tight">{currencySymbol}{balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1">Credit Limit</span>
                <span className="text-lg font-bold text-iron-dust">{currencySymbol}{debt.limit.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-iron-dust uppercase mb-1.5">
              <span>Utilization</span>
              <span className={utilization > 30 ? 'text-magma' : 'text-emerald-vein'}>{utilization.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', utilization > 30 ? 'bg-magma' : 'bg-emerald-vein')}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                {isPromoActive ? 'Promo APR' : 'APR'}
              </span>
              <span className={clsx('text-xl font-bold font-mono', isPromoActive ? 'text-emerald-vein' : 'text-white')}>
                {activeApr}%
              </span>
              {isPromoActive && (
                <span className="block text-[10px] font-mono text-iron-dust mt-0.5">Standard: {debt.apr}%</span>
              )}
            </div>
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Min Payment</span>
              <span className="text-xl font-bold font-mono text-white">
                {currencySymbol}{minPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] font-mono text-iron-dust mt-0.5">
                {debt.minPaymentType === 'percentage' ? `${debt.minPaymentValue}% of balance` : 'Fixed amount'}
              </span>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-sm p-4">
              <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Monthly Interest</span>
              <span className={clsx('text-xl font-bold font-mono', monthlyInterest > 0 ? 'text-magma' : 'text-emerald-vein')}>
                {currencySymbol}{monthlyInterest.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] font-mono text-iron-dust mt-0.5">{activeApr}% APR / 12</span>
            </div>
          </div>

          {/* Promo Offer Section */}
          {debt.promo && (
            <div className={clsx(
              'border rounded-sm p-5',
              isPromoActive ? 'border-emerald-vein/30 bg-emerald-vein/5' : 'border-white/5 bg-black/20'
            )}>
              <div className="flex items-center gap-2 mb-4">
                <Tag size={14} className={isPromoActive ? 'text-emerald-vein' : 'text-iron-dust'} />
                <span className={clsx('text-[10px] font-mono uppercase tracking-[2px] font-bold', isPromoActive ? 'text-emerald-vein' : 'text-iron-dust')}>
                  {isPromoActive ? 'Promotional Offer Active' : 'Promotional Offer Expired'}
                </span>
              </div>

              <div className="flex justify-between text-xs mb-1">
                <span className="text-iron-dust font-mono">
                  {debt.promo.promoApr}% APR until {format(parseISO(debt.promo.promoEndDate), 'd MMM yyyy')}
                </span>
                {promoMonthsLeft !== null && (
                  <span className="text-white font-mono font-bold">{promoMonthsLeft} months left</span>
                )}
              </div>

              {isPromoActive && promoMonthsLeft !== null && (
                <>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mt-3 mb-3">
                    <div
                      className={clsx('h-full rounded-full transition-all', promoShortfall === 0 ? 'bg-emerald-vein' : 'bg-amber-400')}
                      style={{ width: `${Math.min(promoProgress, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-mono mb-3">
                    <span className="text-iron-dust">Projected paid at min payment: {currencySymbol}{(minPayment * promoMonthsLeft).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    <span className={promoShortfall === 0 ? 'text-emerald-vein' : 'text-amber-400'}>
                      {promoShortfall === 0
                        ? 'Paid off in time'
                        : `Shortfall: ${currencySymbol}${promoShortfall.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      }
                    </span>
                  </div>

                  {promoShortfall !== null && promoShortfall > 0 && (
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-sm p-3">
                      <p className="text-[10px] text-amber-400 font-mono">
                        To clear the balance before {format(parseISO(debt.promo.promoEndDate), 'MMM yyyy')}, you need to pay{' '}
                        <strong>{currencySymbol}{(balance / promoMonthsLeft).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month</strong>.
                        After the promo ends, the rate reverts to {debt.apr}% APR.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Pay Off Date */}
          <div className="bg-black/30 border border-white/5 rounded-sm p-5">
            <span className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Pay Off Projection</span>
            {payoffMonths === null ? (
              <p className="text-sm text-magma font-mono">Min payment does not cover interest — balance will grow indefinitely.</p>
            ) : (
              <>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-3xl font-bold text-white">{payoffMonths}</span>
                  <span className="text-sm text-iron-dust mb-1">months</span>
                  <span className="text-sm text-iron-dust mb-1">
                    (~{Math.ceil(payoffMonths / 12)} yr{Math.ceil(payoffMonths / 12) !== 1 ? 's' : ''})
                  </span>
                </div>
                <p className="text-[10px] font-mono text-iron-dust">
                  At {currencySymbol}{minPayment.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month with {activeApr}% APR.
                  Total interest paid: <span className="text-magma">{currencySymbol}{Math.max(0, (minPayment * payoffMonths) - balance).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              </>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-white/5 bg-[#131517] flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
