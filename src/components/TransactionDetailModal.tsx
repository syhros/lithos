import React from 'react';
import { X, TrendingUp, TrendingDown, ArrowLeftRight, CreditCard, Landmark, BarChart2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { Transaction } from '../data/mockData';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

const TYPE_META: Record<string, { label: string; color: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  income:       { label: 'Income',       color: 'text-emerald-vein', Icon: TrendingUp },
  expense:      { label: 'Expense',      color: 'text-magma',        Icon: TrendingDown },
  investing:    { label: 'Investment',   color: 'text-blue-400',     Icon: BarChart2 },
  debt_payment: { label: 'Debt Payment', color: 'text-amber-400',    Icon: CreditCard },
  transfer:     { label: 'Transfer',     color: 'text-iron-dust',    Icon: ArrowLeftRight },
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
    <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] flex-shrink-0 pt-0.5">{label}</span>
    <span className={clsx('text-xs text-right', mono ? 'font-mono text-white' : 'text-white')}>{value}</span>
  </div>
);

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ transaction, onClose, onDelete }) => {
  const { data, currencySymbol } = useFinance();

  if (!transaction) return null;

  const meta = TYPE_META[transaction.type] ?? TYPE_META.expense;
  const { Icon } = meta;
  const account = [...data.assets, ...data.debts].find(a => a.id === transaction.accountId);
  const isInvestment = transaction.type === 'investing';
  const isDividend = transaction.category === 'Dividend';

  const fmtMoney = (n: number, sym = currencySymbol) =>
    `${sym}${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDelete = () => {
    onDelete?.(transaction.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md rounded-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 bg-[#131517] flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className={clsx('w-7 h-7 rounded-sm flex items-center justify-center bg-white/5 border border-white/8', meta.color)}>
              <Icon size={14} />
            </div>
            <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">{meta.label}</span>
          </div>
          <button onClick={onClose} className="text-iron-dust hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Amount hero */}
        <div className="px-5 py-6 border-b border-white/5">
          <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1.5">Amount</p>
          <p className={clsx('text-4xl font-bold tracking-tight', transaction.amount > 0 ? 'text-emerald-vein' : 'text-white')}>
            {transaction.amount > 0 ? '+' : ''}{fmtMoney(transaction.amount)}
          </p>
          <p className="text-sm text-iron-dust mt-1">{transaction.description}</p>
        </div>

        {/* Details grid */}
        <div className="px-5 py-2">
          <DetailRow label="Date" value={format(new Date(transaction.date), 'dd MMM yyyy, HH:mm')} mono />
          <DetailRow label="Account" value={account?.name ?? 'Unknown'} />
          <DetailRow label="Category" value={
            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono bg-white/5 border border-white/5 uppercase text-iron-dust">
              {transaction.category}
            </span>
          } />
          <DetailRow label="Type" value={
            <span className={clsx('text-[10px] font-mono font-bold uppercase', meta.color)}>{meta.label}</span>
          } />

          {isInvestment && transaction.symbol && (
            <>
              <DetailRow label="Ticker" value={
                <span className="font-mono text-white font-bold">{transaction.symbol}</span>
              } />
              {transaction.quantity !== undefined && (
                <DetailRow
                  label={isDividend ? 'Shares Earned' : (transaction.quantity < 0 ? 'Shares Sold' : 'Shares Bought')}
                  value={Math.abs(transaction.quantity).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 8 })}
                  mono
                />
              )}
              {transaction.price !== undefined && (
                <DetailRow
                  label="Price / Share"
                  value={fmtMoney(transaction.price, transaction.currency === 'USD' ? '$' : transaction.currency === 'EUR' ? '€' : '£')}
                  mono
                />
              )}
              {transaction.currency && (
                <DetailRow label="Native Currency" value={transaction.currency} mono />
              )}
            </>
          )}

          <DetailRow label="Transaction ID" value={
            <span className="text-[10px] font-mono text-iron-dust/60 break-all">{transaction.id}</span>
          } />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 bg-[#131517] flex justify-between items-center">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-magma/10 border border-magma/30 text-magma rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/20 transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
