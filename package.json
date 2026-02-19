import React, { useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, eachDayOfInterval, isBefore, parseISO, addDays } from 'date-fns';
import { Transaction } from '../data/mockData';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';

interface HoldingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  holding: {
    symbol: string;
    quantity: number;
    currentValue: number;
    avgPrice: number;
    profitValue: number;
    profitPercent: number;
  } | null;
}

export const HoldingDetailModal: React.FC<HoldingDetailModalProps> = ({ isOpen, onClose, holding }) => {
  const { data, historicalPrices, currentPrices } = useFinance();

  // 1. Filter Transactions for this holding
  const transactions = useMemo(() => {
    if (!holding) return [];
    return data.transactions
      .filter(t => t.type === 'investing' && t.symbol === holding.symbol)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.transactions, holding]);

  // 2. Generate Historical Chart Data
  const chartData = useMemo(() => {
    if (!holding) return [];

    const today = new Date();
    const days = 365; // 1 Year History
    const startDate = subDays(today, days);
    
    const dates = eachDayOfInterval({ start: startDate, end: today });
    const history = historicalPrices[holding.symbol] || {};
    
    // Sort txs ascending for calculation
    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let currentQty = 0;
    let totalCost = 0;
    let txIndex = 0;

    return dates.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Process transactions up to this date
      while(txIndex < sortedTxs.length && isBefore(parseISO(sortedTxs[txIndex].date), addDays(date, 1))) {
        const tx = sortedTxs[txIndex];
        currentQty += tx.quantity || 0;
        totalCost += tx.amount || 0; // Assuming amount is positive cost
        txIndex++;
      }

      // Get Price
      // Fallback to current price if history missing (or 100 as safe default)
      const price = history[dateStr] || currentPrices[holding.symbol]?.price || 100;
      
      const marketValue = currentQty * price;
      
      return {
        date: format(date, 'MMM dd'),
        fullDate: dateStr,
        value: marketValue,
        cost: totalCost,
        price: price
      };
    });
  }, [holding, historicalPrices, transactions, currentPrices]);

  if (!isOpen || !holding) return null;

  const isProfit = holding.profitValue >= 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-4xl h-[80vh] rounded-sm shadow-2xl overflow-hidden relative slide-up flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-start bg-[#131517]">
          <div>
            <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-white font-bold text-xs border border-white/5">
                    {holding.symbol.substring(0, 2)}
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{holding.symbol}</h2>
            </div>
            <p className="text-xs font-mono text-iron-dust uppercase tracking-wider">Investment Performance</p>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="text-right">
                <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Current Value</span>
                <span className="text-2xl font-bold text-white tracking-tight">£{holding.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
             </div>
             <div className="text-right">
                <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Total Return</span>
                <span className={clsx("text-xl font-bold font-mono", isProfit ? "text-emerald-vein" : "text-magma")}>
                    {isProfit ? '+' : ''}£{holding.profitValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-iron-dust hover:text-white transition-colors ml-4">
                <X size={20} />
             </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            
            {/* Chart Section */}
            <div className="mb-10">
                <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2">
                    <TrendingUp size={16} className="text-gold-ore" />
                    Value History (1Y)
                </h3>
                <div className="h-[300px] w-full bg-[#161618] border border-white/5 rounded-sm p-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="gradVal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                            <XAxis 
                                dataKey="date" 
                                hide={true}
                            />
                            <YAxis 
                                tick={{fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono'}} 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(val) => `£${val}`}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1a1c1e', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px', fontFamily: 'JetBrains Mono' }}
                                itemStyle={{ padding: 0 }}
                                formatter={(value: number) => [`£${value.toLocaleString()}`, 'Value']}
                                labelFormatter={(label) => label}
                            />
                            <Area type="monotone" dataKey="value" stroke="#d4af37" strokeWidth={2} fill="url(#gradVal)" />
                            {/* Optional: Add Cost Basis Line if desired, but might be cluttered */}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4 mb-10">
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Shares Owned</span>
                    <span className="text-lg font-mono text-white">{holding.quantity.toFixed(4)}</span>
                </div>
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Avg Buy Price</span>
                    <span className="text-lg font-mono text-white">£{holding.avgPrice.toFixed(2)}</span>
                </div>
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Current Price</span>
                    <span className="text-lg font-mono text-white">£{currentPrices[holding.symbol]?.price.toFixed(2)}</span>
                </div>
                <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
                    <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Return %</span>
                    <span className={clsx("text-lg font-mono", isProfit ? "text-emerald-vein" : "text-magma")}>
                        {holding.profitPercent.toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Transactions List */}
            <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-[2px] mb-6 flex items-center gap-2">
                    <Calendar size={16} className="text-iron-dust" />
                    Transaction History
                </h3>
                <div className="space-y-1">
                    {transactions.map(tx => (
                        <div key={tx.id} className="flex justify-between items-center p-4 bg-[#161618] border border-white/5 rounded-sm hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center border", tx.amount > 0 ? "border-emerald-vein/20 text-emerald-vein" : "border-magma/20 text-magma")}>
                                    <DollarSign size={14} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-white">{tx.description}</p>
                                    <p className="text-[10px] font-mono text-iron-dust">{format(new Date(tx.date), 'dd MMM yyyy')}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-white">
                                    {tx.quantity ? `${tx.quantity.toFixed(2)} shares` : ''} @ £{tx.price?.toFixed(2)}
                                </p>
                                <p className="text-[10px] font-mono text-iron-dust">
                                    Total: £{Math.abs(tx.amount).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
