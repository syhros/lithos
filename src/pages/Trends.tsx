import React, { useMemo, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, subMonths, eachMonthOfInterval, endOfMonth } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';

export const Trends: React.FC = () => {
    const { data, currencySymbol, getHistory } = useFinance();
    const [timeRange, setTimeRange] = useState<'3M' | '6M' | '1Y'>('6M');

    const { monthlyData, netWorthChange, spendingChange, incomeChange, averageMonthly } = useMemo(() => {
        const today = new Date();
        const months = timeRange === '3M' ? 3 : timeRange === '6M' ? 6 : 12;
        const startDate = subMonths(today, months - 1);
        const dates = eachMonthOfInterval({ start: startDate, end: today });

        const monthlyStats: any[] = [];

        dates.forEach((date, idx) => {
            const monthStart = date;
            const monthEnd = endOfMonth(date);
            const monthKey = format(date, 'MMM yy');

            const monthTxs = data.transactions.filter(t => {
                const txDate = new Date(t.date);
                return txDate >= monthStart && txDate <= monthEnd;
            });

            const income = monthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
            const expenses = monthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const netChange = income - expenses;

            monthlyStats.push({
                month: monthKey,
                income,
                expenses,
                net: netChange,
            });
        });

        // Get net worth data from history
        const historyData = getHistory(timeRange);
        const firstNW = historyData[0]?.netWorth || 0;
        const lastNW = historyData[historyData.length - 1]?.netWorth || 0;
        const nwChange = lastNW - firstNW;

        const totalIncome = monthlyStats.reduce((sum, m) => sum + m.income, 0);
        const totalExpenses = monthlyStats.reduce((sum, m) => sum + m.expenses, 0);
        const spendChange = totalExpenses > 0 ? (monthlyStats[monthlyStats.length - 1]?.expenses || 0) - (monthlyStats[0]?.expenses || 0) : 0;
        const incomeChg = totalIncome > 0 ? (monthlyStats[monthlyStats.length - 1]?.income || 0) - (monthlyStats[0]?.income || 0) : 0;

        return {
            monthlyData: monthlyStats,
            netWorthChange: nwChange,
            spendingChange: spendChange,
            incomeChange: incomeChg,
            averageMonthly: totalExpenses / monthlyStats.length,
        };
    }, [data.transactions, timeRange, getHistory]);

    const StatCard: React.FC<{ label: string; value: number; change: number; isPositive?: boolean }> = ({ label, value, change, isPositive }) => {
        const isPositiveChange = isPositive === undefined ? change >= 0 : isPositive;
        const changeColor = isPositiveChange ? 'text-emerald-vein' : 'text-magma';

        return (
            <div className="bg-[#161618] border border-white/5 p-6 rounded-sm">
                <span className="font-mono text-[10px] text-iron-dust uppercase tracking-[2px] block mb-3">{label}</span>
                <div className="text-3xl font-bold text-white mb-2">
                    {currencySymbol}{Math.abs(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className={clsx('text-xs font-mono font-bold flex items-center gap-1', changeColor)}>
                    {isPositiveChange ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositiveChange ? '+' : ''}{currencySymbol}{Math.abs(change).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
            </div>
        );
    };

    return (
        <div className="p-12 max-w-6xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
            <div className="mb-12">
                <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
                <h1 className="text-4xl font-bold text-white tracking-tight mb-8">Trends & Insights</h1>

                {/* Time Range Selector */}
                <div className="flex bg-[#1a1c1e] rounded-sm p-1 border border-white/5 w-fit">
                    {(['3M', '6M', '1Y'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={clsx(
                                'px-4 py-2 text-[10px] font-mono font-bold rounded-sm transition-all',
                                timeRange === range ? 'bg-white text-black' : 'text-iron-dust hover:text-white'
                            )}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <StatCard label="Net Worth Change" value={netWorthChange} change={netWorthChange} />
                <StatCard label="Total Spending" value={monthlyData.reduce((s, m) => s + m.expenses, 0)} change={spendingChange} isPositive={false} />
                <StatCard label="Total Income" value={monthlyData.reduce((s, m) => s + m.income, 0)} change={incomeChange} />
                <StatCard label="Avg Monthly Spend" value={averageMonthly} change={0} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Income vs Expenses */}
                <div className="bg-[#161618] border border-white/5 rounded-sm p-6">
                    <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Income vs Expenses</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                                <XAxis dataKey="month" tick={{ fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                <YAxis tick={{ fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                                    formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, '']}
                                />
                                <Bar dataKey="income" fill="#00f2ad" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="expenses" fill="#ff4d00" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Net Monthly Change */}
                <div className="bg-[#161618] border border-white/5 rounded-sm p-6">
                    <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Net Monthly Change</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                                <defs>
                                    <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                                <XAxis dataKey="month" tick={{ fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                <YAxis tick={{ fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                                    formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, '']}
                                />
                                <Area type="monotone" dataKey="net" stroke="#d4af37" fill="url(#gradNet)" isAnimationActive={true} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Monthly Breakdown Table */}
            <div className="mt-12">
                <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-4">Monthly Breakdown</h3>
                <div className="bg-[#161618] border border-white/5 rounded-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[#1a1c1e]">
                            <tr>
                                <th className="px-6 py-3 font-mono text-[10px] text-iron-dust uppercase tracking-wider">Month</th>
                                <th className="px-6 py-3 font-mono text-[10px] text-emerald-vein uppercase tracking-wider text-right">Income</th>
                                <th className="px-6 py-3 font-mono text-[10px] text-magma uppercase tracking-wider text-right">Expenses</th>
                                <th className="px-6 py-3 font-mono text-[10px] text-gold-ore uppercase tracking-wider text-right">Net</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {monthlyData.map((month, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-white">{month.month}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-emerald-vein text-right">
                                        {currencySymbol}{month.income.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-magma text-right">
                                        {currencySymbol}{month.expenses.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </td>
                                    <td className={clsx('px-6 py-4 font-mono text-xs font-bold text-right', month.net >= 0 ? 'text-emerald-vein' : 'text-magma')}>
                                        {month.net >= 0 ? '+' : ''}{currencySymbol}{month.net.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
