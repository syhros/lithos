
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { initialData, MockData, Transaction, UserProfile, currentStockPrices as fallbackPrices } from '../data/mockData';
import { isBefore, parseISO, subDays, format, isEqual, startOfDay, eachDayOfInterval, addDays } from 'date-fns';

// --- Interfaces ---

interface MarketData {
    price: number;
    change: number;
    changePercent: number;
    currency: string;
}

interface HistoricalPoint {
    date: string;
    netWorth: number;
    assets: number;
    debts: number;
    checking: number;
    savings: number;
    investing: number;
}

interface FinanceContextType {
  data: MockData;
  loading: boolean;
  lastUpdated: Date;
  
  // Data State
  currentPrices: Record<string, MarketData>;
  currentBalances: { [key: string]: number };
  
  // Aggregators
  getHistory: (range: '1W' | '1M' | '1Y') => HistoricalPoint[];
  getTotalNetWorth: () => number;
  
  // Actions
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  refreshData: () => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

// --- Helpers ---

// Forward Fill Algorithm for missing historical prices (e.g., weekends)
const getPriceAtDate = (dateStr: string, history: Record<string, number>, lastKnown: number): number => {
    if (history[dateStr] !== undefined) return history[dateStr];
    return lastKnown;
};

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<MockData>(initialData);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Market Data State
  const [currentPrices, setCurrentPrices] = useState<Record<string, MarketData>>({});
  const [historicalPrices, setHistoricalPrices] = useState<Record<string, Record<string, number>>>({}); // { 'TSLA': { '2023-01-01': 150 } }

  // --- 1. Engine Initialization & Sync ---
  
  const fetchMarketData = async (force: boolean = false) => {
    setLoading(true);
    
    try {
        // A. Identify Symbols
        const uniqueSymbols = Array.from(new Set(
            data.transactions
                .filter(t => t.type === 'investing' && t.symbol)
                .map(t => t.symbol!)
        ));

        if (uniqueSymbols.length === 0) {
            setLoading(false);
            return;
        }

        // B. Smart Caching Logic (30 mins)
        const lastSync = localStorage.getItem('lithos_last_sync');
        const now = Date.now();
        const shouldFetch = force || !lastSync || (now - parseInt(lastSync) > 30 * 60 * 1000);

        if (shouldFetch) {
            // Attempt to fetch from Vercel API
            // Note: In a browser-only environment without the Vercel backend running, this will fail.
            // We expect this to fail in CodeSandbox/StackBlitz unless a server is configured.
            let fetchedPrices: any = {};
            
            try {
                // Check if we are in a dev environment that likely doesn't support the API
                // This is a heuristic; in a real app, you'd check process.env or similar.
                // For now, we attempt the fetch.
                const res = await fetch(`/api/live?symbols=${uniqueSymbols.join(',')}`);
                if (res.ok) {
                    fetchedPrices = await res.json();
                } else {
                    throw new Error(`API returned ${res.status}: Route unreachable`);
                }
            } catch (e) {
                // FALLBACK: Simulate API response
                // We use console.info here to indicate this is an expected fallback in demo mode.
                console.info("Info: API unreachable. Switching to Demo Mode with simulated live data.");
                
                uniqueSymbols.forEach(sym => {
                    const base = fallbackPrices[sym] || 100;
                    const jitter = (Math.random() * 4) - 2;
                    fetchedPrices[sym] = {
                        price: base + jitter,
                        change: jitter,
                        changePercent: (jitter/base) * 100,
                        currency: 'USD'
                    };
                });
            }

            setCurrentPrices(fetchedPrices);
            localStorage.setItem('lithos_last_sync', now.toString());
            setLastUpdated(new Date());

            // C. Historical Backfill (Lazy Load)
            // In a real app, we would loop uniqueSymbols and hit /api/history for each if missing from cache
            // For this demo, we will generate synthetic history based on current price
            const historyCache: Record<string, Record<string, number>> = {};
            
            uniqueSymbols.forEach(sym => {
                const current = fetchedPrices[sym]?.price || 100;
                const history: Record<string, number> = {};
                const today = new Date();
                
                // Generate 365 days of history
                for(let i=0; i<365; i++) {
                    const d = subDays(today, i);
                    const dStr = format(d, 'yyyy-MM-dd');
                    // Random walk backwards
                    const volatility = 0.02; // 2% daily move
                    const prevPrice = current * (1 + (Math.random() * volatility - (volatility/2)));
                    history[dStr] = prevPrice;
                }
                historyCache[sym] = history;
            });
            setHistoricalPrices(historyCache);
        }
    } catch (err) {
        console.error("Critical: Market Data Sync Failed Completely", err);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    // Initial Load
    fetchMarketData(true);
    const interval = setInterval(() => fetchMarketData(false), 60000); // Check every minute if cache expired
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // --- 2. Core Calculation Logic (Balances) ---

  const calculateBalances = (priceMap: Record<string, MarketData> = currentPrices) => {
      const balances: { [key: string]: number } = {};

      // 1. Starting Values
      data.assets.forEach(asset => balances[asset.id] = asset.startingValue);
      data.debts.forEach(debt => balances[debt.id] = debt.startingValue);

      // 2. Ledger Processing
      // We need to track HOLDINGS (Qty) for investment accounts to apply current price
      const holdings: Record<string, Record<string, number>> = {}; // { accountId: { 'TSLA': 10 } }

      data.transactions.forEach(tx => {
          // Cash Impact
          if (balances[tx.accountId] !== undefined) {
              // For Investment accounts, Buying stock doesn't remove value from the Asset, 
              // it converts Cash -> Stock. The "Value" of the account is Cash + (Stock * Price).
              // However, typically 'transfer' into the account adds Cash. 'investing' uses that cash.
              
              if (tx.type === 'investing') {
                  // If it's a Buy, we assume Cash decreases, Stock increases.
                  // But often 'amount' in ledger for buy is positive cost basis.
                  // Let's assume logic: Transfer In (+Cash), Buy Stock (-Cash, +Stock).
                  // In our mock generator, we just added 'amount' to account value. 
                  // Let's switch to a smarter model:
                  // Account Value = Cash Balance + Sum(Holdings * CurrentPrice)
                  
                  // For this aggregator, we will assume the 'amount' field in ledger is strictly CASH movement.
                  // So buying stock = -Cost. Selling = +Proceeds.
                  
                  // However, the Mock Generator was simple. It added value on Buy. 
                  // Let's stick to the Mock Generator's logic for Cash Balance (which was: everything adds/subs from total).
                  // AND add a separate overlay for Market Value Adjustment.
              }
              
              balances[tx.accountId] += tx.amount;
          }

          // Holdings Impact
          if (tx.type === 'investing' && tx.symbol && tx.quantity) {
              if (!holdings[tx.accountId]) holdings[tx.accountId] = {};
              const currentQty = holdings[tx.accountId][tx.symbol] || 0;
              holdings[tx.accountId][tx.symbol] = currentQty + tx.quantity;
          }
      });

      // 3. Mark-to-Market Adjustment
      // For every account with holdings, calculate Current Market Value vs Cost Basis (which is what balances[] currently holds approx)
      // Actually, simplified: Let's assume balances['3'] (Investment) is purely CASH + Realized P&L.
      // We need to ADD the Market Value of holdings to it.
      // But wait, the mock generator added the "Buy Amount" to the balance. So balance includes Cost Basis.
      // We need to calculate: (Current Price - Avg Cost) * Qty = Unrealized P&L.
      // And add that Unrealized P&L to the balance.
      
      Object.keys(holdings).forEach(accId => {
          const accHoldings = holdings[accId];
          Object.keys(accHoldings).forEach(symbol => {
              const qty = accHoldings[symbol];
              const priceData = priceMap[symbol];
              
              // Find average cost from transactions? Too complex for this snippet.
              // Alternative: Just take Current Value (Qty * Price) - Cost Basis (Qty * ???).
              // Since 'balances' already includes the Cost Basis (from the Buy transaction amount),
              // We just need to add the difference.
              // Diff = (Qty * CurrentPrice) - (Qty * CostPrice).
              
              // Actually, simpler: 
              // If the Ledger 'amount' for a Buy was POSITIVE (adding to Asset Value), 
              // then `balances` represents Book Value.
              // We just need to replace Book Value with Market Value? No.
              
              // Let's calculate P&L factor.
              // To represent true Net Worth: Account = Cash + (Qty * CurrentPrice).
              // We need to separate Cash transactions from Investment transactions.
              
              // Hack for this demo to work with existing Mock Generator:
              // We will just add a "Market Adjustment" based on % change of price.
              if (priceData && qty > 0) {
                   const marketValue = qty * priceData.price;
                   // We don't easily know the Cost Basis sum here without re-looping.
                   // Let's assume the mock data prices in `transactions` were the cost basis.
                   // We'll calculate the 'Value Delta' effectively.
                   // But to be robust, let's just say:
                   // The Context computes `currentBalances` for the UI.
                   
                   // Find total cost basis of this holding from ledger
                   const txs = data.transactions.filter(t => t.accountId === accId && t.symbol === symbol);
                   const costBasis = txs.reduce((sum, t) => sum + (t.amount || 0), 0);
                   
                   const adjustment = marketValue - costBasis;
                   if (balances[accId]) balances[accId] += adjustment;
              }
          });
      });

      return balances;
  };

  const currentBalances = useMemo(() => calculateBalances(currentPrices), [data, currentPrices]);

  // --- 3. Wealth Trajectory Aggregator (The Heavy Lifter) ---
  
  const getHistory = (range: '1W' | '1M' | '1Y'): HistoricalPoint[] => {
      const points: HistoricalPoint[] = [];
      const today = new Date();
      let days = 30;
      if (range === '1W') days = 7;
      if (range === '1Y') days = 365;

      // Create array of dates to plot
      const dates = eachDayOfInterval({
          start: subDays(today, days),
          end: today
      });

      // Pre-process Ledger for performance
      // Sort ascending for running balance calculation
      const sortedTxs = [...data.transactions].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Running State
      const balances: Record<string, number> = {};
      const holdings: Record<string, Record<string, number>> = {}; // accId -> symbol -> qty
      
      // Initialize Starting Values
      data.assets.forEach(a => balances[a.id] = a.startingValue);
      data.debts.forEach(d => balances[d.id] = d.startingValue);

      // Pointer for transactions
      let txIndex = 0;

      dates.forEach(date => {
          const dateStr = format(date, 'yyyy-MM-dd');
          
          // 1. Process all transactions up to end of this day
          while(txIndex < sortedTxs.length && isBefore(parseISO(sortedTxs[txIndex].date), addDays(date, 1))) {
              const tx = sortedTxs[txIndex];
              
              // Update Cash/Book Balance
              if (balances[tx.accountId] !== undefined) {
                  balances[tx.accountId] += tx.amount;
              }

              // Update Holdings Qty
              if (tx.type === 'investing' && tx.symbol && tx.quantity) {
                  if (!holdings[tx.accountId]) holdings[tx.accountId] = {};
                  const current = holdings[tx.accountId][tx.symbol] || 0;
                  holdings[tx.accountId][tx.symbol] = current + tx.quantity;
              }
              
              txIndex++;
          }

          // 2. Calculate Net Worth with Historical Pricing
          let totalAssets = 0;
          let totalDebts = 0;
          let checking = 0;
          let savings = 0;
          let investing = 0; // Book Value so far

          // Sum base balances
          Object.keys(balances).forEach(id => {
              const val = balances[id];
              const asset = data.assets.find(a => a.id === id);
              const debt = data.debts.find(d => d.id === id);
              
              if (debt) totalDebts += val;
              if (asset) {
                  if (asset.type === 'checking') checking += val;
                  if (asset.type === 'savings') savings += val;
                  if (asset.type === 'investment') investing += val; // Adds Book Value
              }
          });

          // Apply Historical Mark-to-Market for Investment Accounts
          // Similar logic to calculateBalances but using historicalPrices[symbol][dateStr]
          Object.keys(holdings).forEach(accId => {
               const accHoldings = holdings[accId];
               const asset = data.assets.find(a => a.id === accId);
               if (!asset) return;

               Object.keys(accHoldings).forEach(symbol => {
                   const qty = accHoldings[symbol];
                   const history = historicalPrices[symbol] || {};
                   
                   // Forward Fill Price
                   // In a real app we'd track lastKnownPrice inside the loop for O(1)
                   // Here we just look it up or default
                   const price = getPriceAtDate(dateStr, history, fallbackPrices[symbol] || 100);
                   
                   // VISUAL FIX:
                   // Just add a volatility factor based on price history to the book value.
                   const volatility = (price / (fallbackPrices[symbol] || 100)) - 1; // e.g., 0.05
                   const adjustment = (qty * (fallbackPrices[symbol] || 100)) * volatility;
                   
                   if (asset.type === 'investment') {
                       investing += adjustment;
                   }
               });
          });

          totalAssets = checking + savings + investing;

          points.push({
              date: format(date, range === '1Y' ? 'MMM' : 'dd MMM'),
              netWorth: totalAssets - totalDebts,
              assets: totalAssets,
              debts: totalDebts,
              checking,
              savings,
              investing,
          });
      });

      return points;
  };

  const getTotalNetWorth = () => {
      const totalAssets = (currentBalances['1'] || 0) + (currentBalances['2'] || 0) + (currentBalances['3'] || 0);
      const totalDebts = (currentBalances['4'] || 0);
      return totalAssets - totalDebts;
  };

  // --- Actions ---

  const addTransaction = (tx: Omit<Transaction, 'id'>) => {
    const newTx = { ...tx, id: crypto.randomUUID() };
    setData(prev => ({
        ...prev,
        transactions: [newTx, ...prev.transactions]
    }));
    // Invalidate cache if new symbol added
    if (newTx.symbol && !currentPrices[newTx.symbol]) {
        fetchMarketData(true);
    }
  };

  const deleteTransaction = (id: string) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id)
    }));
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
      setData(prev => ({ ...prev, user: { ...prev.user, ...updates } }));
  };

  const refreshData = async () => {
      await fetchMarketData(true);
  };

  return (
    <FinanceContext.Provider value={{ 
      data, 
      loading,
      lastUpdated,
      currentPrices,
      currentBalances,
      getHistory,
      getTotalNetWorth,
      addTransaction,
      deleteTransaction,
      updateUserProfile,
      refreshData
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used within FinanceProvider");
  return context;
};
