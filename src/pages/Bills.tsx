import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Calendar, Check, AlertCircle, Plus } from 'lucide-react';
import { format, parseISO, isPast, isToday, isThisMonth } from 'date-fns';
import { clsx } from 'clsx';
import { Bill } from '../data/mockData';
import { AddBillModal } from '../components/AddBillModal';

const getNextDueDate = (bill: Bill): Date => {
    if (!bill.isRecurring) {
        return parseISO(bill.dueDate);
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (bill.frequency === 'monthly') {
        const dayOfMonth = parseInt(bill.dueDate, 10);
        const nextDate = new Date(currentYear, currentMonth, dayOfMonth);
        if (nextDate <= now) {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }
        return nextDate;
    } else if (bill.frequency === 'weekly') {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames.indexOf(bill.dueDate.toLowerCase());
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        const nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + daysUntil);
        return nextDate;
    } else {
        return parseISO(bill.dueDate);
    }
};

export const Bills: React.FC = () => {
    const { data, currencySymbol } = useFinance();
    const [showUpcoming, setShowUpcoming] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [billToEdit, setBillToEdit] = useState<Bill | null>(null);

    const { upcoming, paid, overdue, monthly } = useMemo(() => {
        const now = new Date();
        const thisMonth = [];
        const upcomingBills = [];
        const paidBills = [];
        const overdueBills = [];

        data.bills.forEach(bill => {
            const dueDate = getNextDueDate(bill);
            if (bill.isPaid) {
                paidBills.push(bill);
            } else if (isPast(dueDate) && !isToday(dueDate)) {
                overdueBills.push(bill);
            } else {
                upcomingBills.push(bill);
            }
            if (isThisMonth(dueDate)) {
                thisMonth.push(bill);
            }
        });

        const totalMonthly = thisMonth.reduce((sum, bill) => sum + bill.amount, 0);

        return {
            upcoming: upcomingBills.sort((a, b) => getNextDueDate(a).getTime() - getNextDueDate(b).getTime()),
            paid: paidBills.sort((a, b) => getNextDueDate(b).getTime() - getNextDueDate(a).getTime()),
            overdue: overdueBills.sort((a, b) => getNextDueDate(a).getTime() - getNextDueDate(b).getTime()),
            monthly: totalMonthly,
        };
    }, [data.bills]);

    const BillCard: React.FC<{ bill: Bill; isDue?: boolean }> = ({ bill, isDue }) => {
        const dueDate = getNextDueDate(bill);
        const daysUntilDue = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

        const dueDateLabel = bill.isRecurring
            ? bill.frequency === 'weekly'
                ? `Every ${bill.dueDate.charAt(0).toUpperCase() + bill.dueDate.slice(1)}`
                : bill.frequency === 'monthly'
                    ? `Day ${bill.dueDate}`
                    : format(dueDate, 'MMM dd')
            : format(dueDate, 'MMM dd');

        return (
            <div
                onClick={() => setBillToEdit(bill)}
                className="bg-[#161618] border border-white/5 p-5 rounded-sm flex flex-col gap-3 group hover:border-white/10 transition-all cursor-pointer"
            >
                <div className="flex items-start gap-3">
                    <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center border flex-shrink-0 mt-0.5',
                        bill.isPaid ? 'border-emerald-vein/20 text-emerald-vein bg-emerald-vein/5' :
                            isDue ? 'border-magma/20 text-magma bg-magma/5' :
                                'border-white/10 text-white/60'
                    )}>
                        {bill.isPaid ? <Check size={14} /> : <Calendar size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white mb-1 truncate">{bill.name}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-iron-dust">
                            <span>{bill.category}</span>
                            {bill.isRecurring && <span className="px-1.5 py-0.5 bg-white/5 rounded capitalize">{bill.frequency}</span>}
                            {bill.autoPay && <span className="px-1.5 py-0.5 bg-white/5 rounded">Auto-pay</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-end justify-between pt-2 border-t border-white/5">
                    <div className={clsx(
                        'text-[10px] font-mono font-bold uppercase',
                        bill.isPaid ? 'text-emerald-vein' :
                            isDue ? 'text-magma' : 'text-iron-dust'
                    )}>
                        {bill.isPaid ? 'Paid' : dueDateLabel}
                        {!bill.isPaid && daysUntilDue >= 0 && <span className="ml-1">({daysUntilDue}d)</span>}
                    </div>
                    <div className="text-lg font-bold text-white">
                        {currencySymbol}{bill.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-12 max-w-7xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            <div className="flex items-end justify-between mb-12">
                <div>
                    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Bills &amp; Payments</h1>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-magma text-obsidian rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-magma/90 transition-colors shadow-[0_0_15px_rgba(255,77,0,0.3)]"
                >
                    <Plus size={14} />
                    Add Bill
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-[#161618] border border-white/5 p-6 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle size={16} className="text-magma" />
                        <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[2px]">This Month</span>
                    </div>
                    <div className="text-3xl font-bold text-white">
                        {currencySymbol}{monthly.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="bg-[#161618] border border-white/5 p-6 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Calendar size={16} className="text-white/60" />
                        <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[2px]">Upcoming</span>
                    </div>
                    <div className="text-3xl font-bold text-white">
                        {upcoming.length}
                    </div>
                </div>

                <div className="bg-[#161618] border border-magma/20 p-6 rounded-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle size={16} className="text-magma" />
                        <span className="font-mono text-[10px] text-magma uppercase tracking-[2px]">Overdue</span>
                    </div>
                    <div className="text-3xl font-bold text-magma">
                        {overdue.length}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 border-b border-white/5">
                <button
                    onClick={() => setShowUpcoming(true)}
                    className={clsx(
                        'px-4 py-3 border-b-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors',
                        showUpcoming
                            ? 'border-magma text-white'
                            : 'border-transparent text-iron-dust hover:text-white'
                    )}
                >
                    Upcoming
                </button>
                <button
                    onClick={() => setShowUpcoming(false)}
                    className={clsx(
                        'px-4 py-3 border-b-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors',
                        !showUpcoming
                            ? 'border-emerald-vein text-white'
                            : 'border-transparent text-iron-dust hover:text-white'
                    )}
                >
                    Paid
                </button>
            </div>

            {/* Content */}
            <div className="flex-1">
                {showUpcoming ? (
                    <>
                        {overdue.length > 0 && (
                            <div className="mb-8">
                                <h3 className="text-xs font-bold text-magma uppercase tracking-[2px] mb-4">Overdue</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {overdue.map(bill => (
                                        <BillCard key={bill.id} bill={bill} isDue={true} />
                                    ))}
                                </div>
                            </div>
                        )}
                        {upcoming.length > 0 ? (
                            <div>
                                <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Coming Up</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {upcoming.map(bill => (
                                        <BillCard key={bill.id} bill={bill} />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-iron-dust font-mono text-sm">
                                No upcoming bills
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {paid.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {paid.map(bill => (
                                    <BillCard key={bill.id} bill={bill} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-iron-dust font-mono text-sm">
                                No paid bills yet
                            </div>
                        )}
                    </>
                )}
            </div>

            <AddBillModal
                isOpen={showAddModal || !!billToEdit}
                onClose={() => { setShowAddModal(false); setBillToEdit(null); }}
                billToEdit={billToEdit || undefined}
            />
        </div>
    );
};
