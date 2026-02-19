import React, { useMemo, useState } from 'react';
import { X, Calendar, DollarSign } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, eachDayOfInterval, isBefore, parseISO, addDays, subWeeks, subMonths } from 'date-fns';
import { clsx } from 'clsx';
import { useFinance, USD_TO_GBP, getCurrencySymbol } from '../context/FinanceContext';

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
type ChartMode = 'VALUE' | 'STOCK';

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

const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];

const getStartDate = (range: TimeRange, allDates: Date[]): Date => {
  const today = new Date();
  switch (range) {
    case '1W': return subWeeks(today, 1);
    case '1M': return subMonths(today, 1);
    case '3M': return subMonths(today, 3);
    case '6M': return subMonths(today, 6);
    case '1Y': return subDays(today, 365);
    case 'ALL': return allDates.length > 0 ? allDates[0] : subDays(today, 365);
  }
};

const getDateFormat = (range: TimeRange): string => {
  switch (range) {
    case '1W': return 'dd MMM';
    case '1M': return 'dd MMM';
    case '3M': return 'dd MMM';
    case '6M': return 'MMM yy';
    case '1Y': return 'MMM yy';
    case 'ALL': return 'MMM yy';
  }
};

const CustomTooltip = ({ active, payload, label, mode, nativeCurrency, currencySymbol, nativeSymbol }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0]?.value;
    const isUsd = nativeCurrency === 'USD';
    return (
      <div className="bg-[#1a1c1e] border border-white/10 p-3 rounded-sm shadow-xl min-w-[160px]">
        <p className="text-[10px] font-mono text-iron-dust uppercase tracking-widest mb-2">{label}</p>
        <p className="text-xs font-bold text-white font-mono">
          {mode === 'VALUE'
            ? `${currencySymbol}${value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `${nativeSymbol}${value?.toFixed(2)}`
          }
        </p>
        {mode === 'STOCK' && isUsd && (
          <p className="text-[9px] font-mono text-iron-dust mt-0.5">
            ≈ {currencySymbol}{(value * USD_TO_GBP)?.toFixed(2)} GBP
          </p>
        )}
        <p className="text-[9px] font-mono text-iron-dust mt-0.5 uppercase">
          {mode === 'VALUE' ? `Portfolio Value (${nativeCurrency || 'GBP'})` : `Stock Price (${nativeCurrency || 'GBP'})`}
        </p>
      </div>
    );
  }
  return null;
};

export const HoldingDetailModal: React.FC<HoldingDetailModalProps> = ({ isOpen, onClose, holding }) => {
  const { data, historicalPrices, currentPrices, currencySymbol } = useFinance();
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [chartMode, setChartMode] = useState<ChartMode>('VALUE');

  const transactions = useMemo(() => {
    if (!holding) return [];
    return (data?.transactions || [])
      .filter(t => t.type === 'investing' && t.symbol === holding.symbol)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data?.transactions, holding]);

  const nativeCurrency = useMemo(() => {
    const tx = transactions.find(t => t.currency);
    return tx?.currency || 'GBP';
  }, [transactions]);

  const isUsd = nativeCurrency === 'USD';
  const fxRate = isUsd ? USD_TO_GBP : 1;
  const nativeSymbol = isUsd ? '$' : '£';

  const allChartData = useMemo(() => {
    if (!holding) return [];

    const today = new Date();
    const fullStart = subDays(today, 365);
    const dates = eachDayOfInterval({ start: fullStart, end: today });
    const history = historicalPrices[holding.symbol] || {};

    const sortedTxs = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentQty = 0;
    let txIndex = 0;
    let lastKnownPrice = currentPrices[holding.symbol]?.price || 100;

    return dates.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');

      while (txIndex < sortedTxs.length && isBefore(parseISO(sortedTxs[txIndex].date), addDays(date, 1))) {
        const tx = sortedTxs[txIndex];
        currentQty += tx.quantity || 0;
        txIndex++;
      }

      const price = history[dateStr] !== undefined ? history[dateStr] : lastKnownPrice;
      if (history[dateStr] !== undefined) lastKnownPrice = history[dateStr];
      const marketValueGbp = currentQty * price * fxRate;

      return {
        date,
        dateStr,
        value: marketValueGbp,
        price, // always native currency (USD or GBP)
        qty: currentQty,
      };
    });
  }, [holding, historicalPrices, transactions, currentPrices, fxRate]);

  const chartData = useMemo(() => {
    if (!holding || allChartData.length === 0) return [];

    const allDates = allChartData.map(d => d.date);
    const startDate = getStartDate(timeRange, allDates);
    const fmt = getDateFormat(timeRange);

    return allChartData
      .filter(d => !isBefore(d.date, startDate))
      .map(d => ({
        date: format(d.date, fmt),
        value: parseFloat(d.value.toFixed(2)),
        price: parseFloat(d.price.toFixed(2)),
      }));
  }, [allChartData, timeRange, holding]);

  if (!isOpen || !holding) return null;

  const isProfit = holding.profitValue >= 0;
  const activeDataKey = chartMode === 'VALUE' ? 'value' : 'price';
  const chartColor = chartMode === 'VALUE' ? '#d4af37' : '#3b82f6';
  const gradientId = `grad-${chartMode.toLowerCase()}`;

  const chartMin = chartData.length > 0
    ? Math.min(...chartData.map(d => chartMode === 'VALUE' ? d.value : d.price)) * 0.98
    : 'auto';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-4xl h-[85vh] rounded-sm shadow-2xl overflow-hidden relative slide-up flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-start bg-[#131517]">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center text-white font-bold text-xs border border-white/5">
                {holding.symbol.substring(0, 2)}
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">{holding.symbol}</h2>
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-1 rounded-sm border"
                style={{ borderColor: isUsd ? 'rgba(59,130,246,0.3)' : 'rgba(212,175,55,0.3)', color: isUsd ? '#3b82f6' : '#d4af37' }}>
                {nativeCurrency}
              </span>
            </div>
            <p className="text-xs font-mono text-iron-dust uppercase tracking-wider">Investment Performance</p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Current Value</span>
              <span className="text-2xl font-bold text-white tracking-tight">
                {currencySymbol}{holding.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] text-iron-dust uppercase tracking-wider mb-1">Total Return</span>
              <span className={clsx('text-xl font-bold font-mono', isProfit ? 'text-emerald-vein' : 'text-magma')}>
                {isProfit ? '+' : ''}{currencySymbol}{holding.profitValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
            <div className="h-[340px] w-full bg-[#161618] border border-white/5 rounded-sm relative flex flex-col p-6">

              {/* Controls Header */}
              <div className="flex justify-between items-center mb-4 z-10">

                {/* MODE TOGGLE: VALUE / STOCK */}
                <div className="flex bg-[#1a1c1e] rounded-sm p-1 border border-white/5">
                  {(['VALUE', 'STOCK'] as ChartMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setChartMode(mode)}
                      className={clsx(
                        'px-4 py-1.5 text-[10px] font-mono font-bold rounded-sm transition-all uppercase tracking-widest',
                        chartMode === mode ? 'bg-white text-black' : 'text-iron-dust hover:text-white'
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* TIME RANGE SELECTOR */}
                <div className="flex bg-[#1a1c1e] rounded-sm p-1 border border-white/5">
                  {TIME_RANGES.map(range => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={clsx(
                        'px-3 py-1.5 text-[10px] font-mono font-bold rounded-sm transition-all',
                        timeRange === range ? 'bg-white text-black' : 'text-iron-dust hover:text-white'
                      )}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Area */}
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} strokeOpacity={0.05} />
                    <XAxis
                      hide={true}
                      dataKey="date"
                    />
                    <YAxis
                      tick={{ fill: '#8e8e93', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[chartMin, 'auto']}
                      tickFormatter={(val) =>
                        chartMode === 'VALUE'
                          ? `${currencySymbol}${(val / 1000).toFixed(0)}k`
                          : `${nativeSymbol}${val.toFixed(0)}`
                      }
                    />
                    <Tooltip content={<CustomTooltip mode={chartMode} nativeCurrency={nativeCurrency} currencySymbol={currencySymbol} nativeSymbol={nativeSymbol} />} />
                    <Area
                      key={chartMode}
                      type="monotone"
                      dataKey={activeDataKey}
                      stroke={chartColor}
                      strokeWidth={2}
                      fill={`url(#${gradientId})`}
                      isAnimationActive={true}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-10">
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Shares Owned</span>
              <span className="text-lg font-mono text-white">{holding.quantity.toFixed(4)}</span>
            </div>
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Avg Buy Price ({nativeCurrency})</span>
              <span className="text-lg font-mono text-white">{nativeSymbol}{holding.avgPrice.toFixed(2)}</span>
            </div>
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Current Price ({nativeCurrency})</span>
              <div>
                <span className="text-lg font-mono text-white">{nativeSymbol}{currentPrices[holding.symbol]?.price.toFixed(2)}</span>
                {isUsd && (
                  <span className="text-[10px] font-mono text-iron-dust block">
                    ≈ {currencySymbol}{((currentPrices[holding.symbol]?.price || 0) * USD_TO_GBP).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-[#161618] p-4 rounded-sm border border-white/5">
              <span className="text-[9px] text-iron-dust uppercase tracking-wider block mb-1">Return %</span>
              <span className={clsx('text-lg font-mono', isProfit ? 'text-emerald-vein' : 'text-magma')}>
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
                    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center border', tx.amount > 0 ? 'border-emerald-vein/20 text-emerald-vein' : 'border-magma/20 text-magma')}>
                      <DollarSign size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{tx.description}</p>
                      <p className="text-[10px] font-mono text-iron-dust">{format(new Date(tx.date), 'dd MMM yyyy')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-white">
                      {tx.quantity ? `${tx.quantity.toFixed(2)} shares` : ''} @ {getCurrencySymbol(tx.currency || 'GBP')}{tx.price?.toFixed(2)}
                    </p>
                    <p className="text-[10px] font-mono text-iron-dust">
                      Total: {currencySymbol}{Math.abs(tx.amount).toLocaleString()}
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
