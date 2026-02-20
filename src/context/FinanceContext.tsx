import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { MockData, Transaction, Asset, Debt, Bill, UserProfile, currentStockPrices as fallbackPrices, TransactionType, AssetType, Currency, DebtType, Frequency, MinPaymentType } from '../data/mockData';
import { subDays, format } from 'date-fns';
import { supabase } from '../lib/supabase';

interface MarketData {
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    name?: string;
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
  deletingTransactions: boolean;
  lastUpdated: Date;

  currentPrices: Record<string, MarketData>;
  currentBalances: { [key: string]: number };
  historicalPrices: Record<string, Record<string, number>>;

  getHistory: (range: '1W' | '1M' | '1Y') => HistoricalPoint[];
  getTotalNetWorth: () => number;

  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, updates: Partial<Omit<Transaction, 'id'>>) => void;
  deleteTransaction: (id: string) => void;
  deleteTransactions: (ids: string[]) => Promise<void>;
  addAccount: (account: Omit<Asset, 'id'>) => void;
  updateAccount: (id: string, updates: Partial<Omit<Asset, 'id'>>) => void;
  deleteAccount: (id: string) => void;
  addDebt: (debt: Omit<Debt, 'id'>) => void;
  updateDebt: (id: string, updates: Partial<Omit<Debt, 'id'>>) => void;
  deleteDebt: (id: string) => void;
  addBill: (bill: Omit<Bill, 'id'>) => void;
  updateBill: (id: string, updates: Partial<Omit<Bill, 'id'>>) => void;
  deleteBill: (id: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  refreshData: () => Promise<void>;

  currencySymbol: string;
  gbpUsdRate: number;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const getCurrencySymbol = (currency: string): string => {
    switch (currency) {
        case 'USD': return '$';
        case 'EUR': return '\u20ac';
        case 'GBX': return 'p';
        default: return '\u00a3';
    }
};

const getCurrencyFromTransactions = (
  symbol: string,
  transactions: Transaction[]
): string => {
  const tx = transactions.find(t => t.symbol === symbol && t.currency);
  return tx?.currency || 'GBP';
};

const getEarliestTxDate = (symbol: string, transactions: Transaction[]): string => {
  const txs = transactions.filter(t => t.symbol === symbol && t.date);
  if (txs.length === 0) return format(subDays(new Date(), 365), 'yyyy-MM-dd');
  const earliest = txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date);
  return earliest.substring(0, 10);
};

const generateSyntheticHistory = (currentPrice: number): Record<string, number> => {
    const history: Record<string, number> = {};
    const today = new Date();
    const volatility = 0.015;
    const prices: number[] = [currentPrice];

    for (let i = 1; i < 365; i++) {
        const prev = prices[i - 1];
        const move = prev * (1 + (Math.random() * volatility * 2 - volatility));
        prices.push(move);
    }

    prices.reverse();

    for (let i = 0; i < 365; i++) {
        const d = subDays(today, i);
        history[format(d, 'yyyy-MM-dd')] = prices[i];
    }

    return history;
};

// Helper: get a valid session JWT to authenticate edge function calls.
// Falls back to the anon key only if no session is available.
const getAuthToken = async (): Promise<string> => {
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch (_) {}
  return supabaseKey;
};

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<MockData>({
    transactions: [],
    assets: [],
    debts: [],
    bills: [],
    recurring: [],
    user: { username: '', currency: 'GBP', notifications: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [deletingTransactions, setDeletingTransactions] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentPrices, setCurrentPrices] = useState<Record<string, MarketData>>({});
  const [historicalPrices, setHistoricalPrices] = useState<Record<string, Record<string, number>>>({});
  const [gbpUsdRate, setGbpUsdRate] = useState<number>(0);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string>('');

  const fetchFxRate = async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    try {
      const token = await getAuthToken();
      await fetch(`${supabaseUrl}/functions/v1/fx-rate`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.info('FX rate refresh failed');
    }

    try {
      const { data } = await supabase
        .from('exchange_rates')
        .select('rate, updated_at')
        .eq('from_currency', 'GBP')
        .eq('to_currency', 'USD')
        .maybeSingle();

      if (data?.rate && data.rate > 0) {
        setGbpUsdRate(Number(data.rate));
        setRateUpdatedAt(data.updated_at);
      }
    } catch (e) {
      console.info('Failed to load FX rate from database');
    }
  };

  const loadUserData = async (isInitialLoad: boolean = false) => {
    setLoading(true);
    const startTime = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const userId = session.user.id;

      let allTransactions: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: txBatch, error: txError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .range(offset, offset + pageSize - 1);

        if (txError || !txBatch) {
          hasMore = false;
        } else {
          allTransactions = allTransactions.concat(txBatch);
          if (txBatch.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        }
      }

      const [
        { data: profile },
        { data: accounts },
        { data: debts },
        { data: bills }
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('accounts').select('*').eq('user_id', userId),
        supabase.from('debts').select('*').eq('user_id', userId),
        supabase.from('bills').select('*').eq('user_id', userId)
      ]);

      const transactions = allTransactions;

      const mappedAccounts: Asset[] = (accounts || []).map(a => ({
        id: a.id,
        name: a.name,
        type: a.type as AssetType,
        currency: a.currency as Currency,
        institution: a.institution,
        color: a.color,
        startingValue: parseFloat(a.starting_value),
        interestRate: a.interest_rate ? parseFloat(a.interest_rate) : undefined,
        symbol: a.symbol,
        isClosed: a.is_closed,
        openedDate: a.opened_date,
        closedDate: a.closed_date
      }));

      const mappedTransactions: Transaction[] = (transactions || []).map(t => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: parseFloat(t.amount),
        type: t.type as TransactionType,
        category: t.category,
        accountId: t.account_id,
        symbol: t.symbol,
        quantity: t.quantity ? parseFloat(t.quantity) : undefined,
        price: t.price ? parseFloat(t.price) : undefined,
        currency: t.currency
      }));

      const mappedDebts: Debt[] = (debts || []).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type as DebtType,
        limit: parseFloat(d.credit_limit),
        apr: parseFloat(d.apr),
        minPaymentType: d.min_payment_type as MinPaymentType,
        minPaymentValue: parseFloat(d.min_payment_value),
        startingValue: parseFloat(d.starting_value),
        promo: d.promo_apr ? {
          promoApr: parseFloat(d.promo_apr),
          promoEndDate: d.promo_end_date
        } : undefined
      }));

      const mappedBills: Bill[] = (bills || []).map(b => ({
        id: b.id,
        name: b.name,
        amount: parseFloat(b.amount),
        dueDate: b.due_date,
        isPaid: b.is_paid,
        autoPay: b.auto_pay,
        category: b.category,
        isRecurring: b.is_recurring,
        frequency: b.frequency as Frequency | undefined,
        recurringEndDate: b.recurring_end_date
      }));

      setData({
        transactions: mappedTransactions,
        assets: mappedAccounts,
        debts: mappedDebts,
        bills: mappedBills,
        recurring: [],
        user: {
          username: profile?.username || '',
          currency: profile?.currency || 'GBP',
          notifications: 0
        }
      });

      setLastUpdated(new Date());
      await fetchMarketData(false, mappedTransactions);

      if (isInitialLoad) {
        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, 2000 - elapsed);
        if (remainingDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketData = async (force: boolean = false, txOverride?: Transaction[]) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const activeTxs = txOverride ?? data.transactions;

      const uniqueSymbols = Array.from(new Set(
        activeTxs
          .filter(t => t.type === 'investing' && t.symbol)
          .map(t => t.symbol!)
      ));

      if (uniqueSymbols.length === 0) return;

      const symbolCurrencyMap: Record<string, string> = {};
      uniqueSymbols.forEach(sym => {
        symbolCurrencyMap[sym] = getCurrencyFromTransactions(sym, activeTxs);
      });

      const symbolFromDateMap: Record<string, string> = {};
      uniqueSymbols.forEach(sym => {
        symbolFromDateMap[sym] = getEarliestTxDate(sym, activeTxs);
      });

      const lastSync = localStorage.getItem('lithos_last_sync');
      const now = Date.now();
      const shouldFetch = force || !lastSync || (now - parseInt(lastSync) > 30 * 60 * 1000);

      if (shouldFetch) {
        const token = await getAuthToken();
        const authHeader = { 'Authorization': `Bearer ${token}` };

        let fetchedPrices: any = {};
        let liveApiAvailable = false;

        try {
          const res = await fetch(
            `${supabaseUrl}/functions/v1/live-prices?symbols=${uniqueSymbols.join(',')}`,
            { headers: authHeader }
          );
          if (res.ok) {
            const rawPrices = await res.json();
            uniqueSymbols.forEach(sym => {
              if (rawPrices[sym]) {
                fetchedPrices[sym] = {
                  ...rawPrices[sym],
                  currency: symbolCurrencyMap[sym] || rawPrices[sym].currency || 'GBP',
                  name: rawPrices[sym].name ?? sym,
                };
              }
            });
            liveApiAvailable = true;
          } else {
            console.warn(`live-prices returned ${res.status}`);
          }
        } catch (e) {
          console.warn('live-prices fetch failed, using fallback prices:', e);
          uniqueSymbols.forEach(sym => {
            const base = fallbackPrices[sym] || 100;
            const jitter = (Math.random() * 4) - 2;
            fetchedPrices[sym] = {
              price: base + jitter,
              change: jitter,
              changePercent: 0,
              currency: symbolCurrencyMap[sym] || 'GBP',
              name: sym,
            };
          });
        }

        localStorage.setItem('lithos_last_sync', now.toString());

        const historyCache: Record<string, Record<string, number>> = {};

        await Promise.all(uniqueSymbols.map(async sym => {
          let history: Record<string, number> = {};
          const fromDate = symbolFromDateMap[sym];

          if (liveApiAvailable) {
            try {
              const hRes = await fetch(
                `${supabaseUrl}/functions/v1/price-history?symbol=${sym}&from=${fromDate}`,
                { headers: authHeader }
              );
              if (hRes.ok) {
                const response = await hRes.json();
                const rows: { date: string; close: number }[] = response[sym] || [];
                rows.forEach(row => { history[row.date] = row.close; });
              }
            } catch (e) {
              console.info(`Failed to fetch history for ${sym}:`, e);
            }
          }

          if (Object.keys(history).length === 0) {
            try {
              let allCached: any[] = [];
              let offset = 0;
              const pageSize = 1000;
              let hasMore = true;

              while (hasMore) {
                const { data: cached, error } = await supabase
                  .from('price_history_cache')
                  .select('date, close')
                  .eq('symbol', sym)
                  .gte('date', fromDate)
                  .order('date', { ascending: true })
                  .range(offset, offset + pageSize - 1);

                if (error || !cached || cached.length === 0) {
                  hasMore = false;
                } else {
                  allCached = allCached.concat(cached);
                  if (cached.length < pageSize) {
                    hasMore = false;
                  } else {
                    offset += pageSize;
                  }
                }
              }

              if (allCached && allCached.length > 0) {
                allCached.forEach((row: { date: string; close: number }) => {
                  history[row.date] = row.close;
                });
              }
            } catch (e) {
              console.info(`Supabase cache miss for ${sym}`);
            }
          }

          if (Object.keys(history).length === 0) {
            history = generateSyntheticHistory(fetchedPrices[sym]?.price || fallbackPrices[sym] || 100);
          }

          historyCache[sym] = history;
        }));

        setHistoricalPrices(historyCache);
        localStorage.setItem('lithos_historical_prices', JSON.stringify(historyCache));

        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const updatedPrices = { ...fetchedPrices };
        uniqueSymbols.forEach(sym => {
          const hist = historyCache[sym];
          const currentPrice = updatedPrices[sym]?.price;
          if (hist && currentPrice) {
            const prevClose = hist[yesterday];
            if (prevClose && prevClose > 0) {
              const chg = currentPrice - prevClose;
              const chgPct = (chg / prevClose) * 100;
              updatedPrices[sym] = { ...updatedPrices[sym], change: chg, changePercent: chgPct };
            }
          }
        });
        setCurrentPrices(updatedPrices);
        localStorage.setItem('lithos_current_prices', JSON.stringify(updatedPrices));
      }
    } catch (error) {
      console.error('Market data sync failed:', error);
    }
  };

  useEffect(() => {
    const cachedPrices = localStorage.getItem('lithos_current_prices');
    if (cachedPrices) {
      try {
        setCurrentPrices(JSON.parse(cachedPrices));
      } catch (e) {
        console.info('Failed to load cached prices');
      }
    }
    const cachedHistory = localStorage.getItem('lithos_historical_prices');
    if (cachedHistory) {
      try {
        setHistoricalPrices(JSON.parse(cachedHistory));
      } catch (e) {
        console.info('Failed to load cached historical prices');
      }
    }

    (async () => {
      await fetchFxRate();
      await loadUserData(true);
    })();

    const msUntilNextHour = (60 - new Date().getMinutes()) * 60 * 1000 - new Date().getSeconds() * 1000;
    const firstTimeout = setTimeout(() => {
      fetchFxRate();
      const hourlyInterval = setInterval(fetchFxRate, 60 * 60 * 1000);
      return () => clearInterval(hourlyInterval);
    }, msUntilNextHour);

    return () => clearTimeout(firstTimeout);
  }, []);

  const getHoldingsByAccount = (accountId: string) => {
    const userCurrency = data.user.currency || 'GBP';
    const map = new Map<string, any>();

    data.transactions
      .filter(t => t.type === 'investing' && t.accountId === accountId && t.symbol && t.quantity)
      .forEach(t => {
        if (!map.has(t.symbol)) {
          map.set(t.symbol, {
            symbol: t.symbol,
            quantity: 0,
            totalCost: 0,
            currency: t.currency || 'GBP'
          });
        }
        const h = map.get(t.symbol)!;
        h.quantity += t.quantity || 0;
        h.totalCost += (t.amount || 0);
        if (t.currency) h.currency = t.currency;
      });

    return Array.from(map.values()).map(h => {
      const marketData = currentPrices[h.symbol];
      const nativeCurrency = h.currency || marketData?.currency || 'GBP';
      const stockIsUsd = nativeCurrency === 'USD';
      const stockIsGbx = nativeCurrency === 'GBX';
      const userIsUsd = userCurrency === 'USD';

      let fxRate = 1;
      if (gbpUsdRate > 0) {
        if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
        if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
      }

      const nativePrice = marketData ? marketData.price : 0;

      let displayPrice = nativePrice;
      if (stockIsGbx) {
        displayPrice = nativePrice / 100;
      } else {
        displayPrice = nativePrice * fxRate;
      }

      const currentValue = h.quantity * displayPrice;

      return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue };
    });
  };

  const currentBalances = useMemo(() => {
    const balances: { [key: string]: number } = {};

    data.assets.forEach(asset => {
      if (asset.type === 'investment') {
        const holdings = getHoldingsByAccount(asset.id);
        balances[asset.id] = holdings.reduce((sum, h) => sum + h.currentValue, 0);
      } else {
        balances[asset.id] = asset.startingValue;
      }
    });

    data.transactions.forEach(tx => {
      if (tx.accountId && balances[tx.accountId] !== undefined && tx.type !== 'investing') {
        balances[tx.accountId] += tx.amount;
      }
    });

    return balances;
  }, [data.assets, data.transactions, currentPrices, gbpUsdRate]);

  const getHistory = (range: '1W' | '1M' | '1Y'): HistoricalPoint[] => {
    const days = range === '1W' ? 7 : range === '1M' ? 30 : 365;
    const points: HistoricalPoint[] = [];
    const userCurrency = data.user.currency || 'GBP';

    for (let i = days; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');

      let checking = 0, savings = 0, investing = 0;

      data.assets.forEach(asset => {
        if (asset.type === 'checking') {
          checking += asset.startingValue;
          data.transactions
            .filter(t => t.accountId === asset.id && t.type !== 'investing' && new Date(t.date) <= d)
            .forEach(t => { checking += t.amount; });
        }
        else if (asset.type === 'savings') {
          savings += asset.startingValue;
          data.transactions
            .filter(t => t.accountId === asset.id && t.type !== 'investing' && new Date(t.date) <= d)
            .forEach(t => { savings += t.amount; });
        }
        else if (asset.type === 'investment') {
          const investingTxns = data.transactions
            .filter(t => t.type === 'investing' && t.accountId === asset.id && t.symbol && t.quantity && new Date(t.date) <= d);

          const holdings = new Map<string, any>();
          investingTxns.forEach(t => {
            if (!holdings.has(t.symbol!)) {
              holdings.set(t.symbol!, {
                symbol: t.symbol,
                quantity: 0,
                currency: t.currency || 'GBP'
              });
            }
            const h = holdings.get(t.symbol!)!;
            h.quantity += t.quantity || 0;
            if (t.currency) h.currency = t.currency;
          });

          Array.from(holdings.values()).forEach(h => {
            const historicalData = historicalPrices[h.symbol] || {};
            let priceOnDate = historicalData[dateStr];

            if (priceOnDate === undefined) {
              const dates = Object.keys(historicalData).sort();
              const latestBeforeDate = dates.filter(date => date <= dateStr).pop();
              priceOnDate = latestBeforeDate ? historicalData[latestBeforeDate] : currentPrices[h.symbol]?.price || 0;
            }

            if (priceOnDate) {
              const nativeCurrency = h.currency || currentPrices[h.symbol]?.currency || 'GBP';
              const stockIsUsd = nativeCurrency === 'USD';
              const stockIsGbx = nativeCurrency === 'GBX';
              const userIsUsd = userCurrency === 'USD';

              let fxRate = 1;
              if (gbpUsdRate > 0) {
                if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
                if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
              }

              let adjustedPrice = priceOnDate;
              if (stockIsGbx) {
                adjustedPrice = priceOnDate / 100;
              } else {
                adjustedPrice = priceOnDate * fxRate;
              }
              investing += h.quantity * adjustedPrice;
            }
          });
        }
      });

      let assets = checking + savings + investing;
      let debts = 0;

      data.debts.forEach(debt => {
        debts += debt.startingValue;
      });

      const netWorth = assets - debts;

      points.push({
        date: dateStr,
        netWorth,
        assets,
        debts,
        checking,
        savings,
        investing
      });
    }

    return points;
  };

  const getTotalNetWorth = (): number => {
    const assets = Object.values(currentBalances).reduce((a, b) => a + b, 0);
    const debts = data.debts.reduce((sum, d) => sum + d.startingValue, 0);
    return assets - debts;
  };

  const addTransaction = async (tx: Omit<Transaction, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: newTx } = await supabase.from('transactions').insert({
      user_id: session.user.id,
      account_id: tx.accountId,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      symbol: tx.symbol,
      quantity: tx.quantity,
      price: tx.price,
      currency: tx.currency,
      debt_id: (tx as any).debtId
    }).select().maybeSingle();

    if (newTx) {
      setData(prev => ({
        ...prev,
        transactions: [...prev.transactions, {
          id: newTx.id,
          ...tx
        }]
      }));
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Omit<Transaction, 'id'>>) => {
    const dbUpdates: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'accountId') dbUpdates['account_id'] = value;
      else if (key === 'symbol') dbUpdates['symbol'] = value;
      else if (key === 'quantity') dbUpdates['quantity'] = value;
      else if (key === 'price') dbUpdates['price'] = value;
      else if (key === 'currency') dbUpdates['currency'] = value;
      else dbUpdates[key] = value;
    });

    const { error } = await supabase.from('transactions').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Failed to update transaction:', error);
      return;
    }
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === id ? { ...t, ...updates } : t)
    }));
  };

  const deleteTransaction = (id: string) => {
    supabase.from('transactions').delete().eq('id', id).then(() => {
      setData(prev => ({
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id)
      }));
    });
  };

  const deleteTransactions = async (ids: string[]): Promise<void> => {
    setDeletingTransactions(true);
    try {
      const batchSize = 50;
      const idSet = new Set(ids);

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase.from('transactions').delete().in('id', batch);
        if (error) {
          console.error('Error deleting transaction batch:', error);
        }
      }

      setData(prev => ({
        ...prev,
        transactions: prev.transactions.filter(t => !idSet.has(t.id))
      }));
    } finally {
      setDeletingTransactions(false);
    }
  };

  const addAccount = async (account: Omit<Asset, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: newAccount } = await supabase.from('accounts').insert({
      user_id: session.user.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution,
      color: account.color,
      starting_value: account.startingValue,
      interest_rate: account.interestRate,
      symbol: account.symbol,
      is_closed: account.isClosed,
      opened_date: account.openedDate
    }).select().maybeSingle();

    if (newAccount) {
      setData(prev => ({
        ...prev,
        assets: [...prev.assets, {
          id: newAccount.id,
          ...account
        }]
      }));
    }
  };

  const updateAccount = async (id: string, updates: Partial<Omit<Asset, 'id'>>) => {
    await supabase.from('accounts').update({
      name: updates.name,
      institution: updates.institution,
      color: updates.color,
      interest_rate: updates.interestRate,
      is_closed: updates.isClosed,
      closed_date: updates.closedDate
    }).eq('id', id);

    setData(prev => ({
      ...prev,
      assets: prev.assets.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
  };

  const deleteAccount = (id: string) => {
    supabase.from('accounts').delete().eq('id', id).then(() => {
      setData(prev => ({
        ...prev,
        assets: prev.assets.filter(a => a.id !== id),
        transactions: prev.transactions.filter(t => t.accountId !== id)
      }));
    });
  };

  const addDebt = async (debt: Omit<Debt, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: newDebt } = await supabase.from('debts').insert({
      user_id: session.user.id,
      name: debt.name,
      type: debt.type,
      credit_limit: debt.limit,
      apr: debt.apr,
      min_payment_type: debt.minPaymentType,
      min_payment_value: debt.minPaymentValue,
      starting_value: debt.startingValue,
      promo_apr: debt.promo?.promoApr,
      promo_end_date: debt.promo?.promoEndDate
    }).select().maybeSingle();

    if (newDebt) {
      setData(prev => ({
        ...prev,
        debts: [...prev.debts, {
          id: newDebt.id,
          ...debt
        }]
      }));
    }
  };

  const updateDebt = async (id: string, updates: Partial<Omit<Debt, 'id'>>) => {
    await supabase.from('debts').update({
      name: updates.name,
      type: updates.type,
      credit_limit: updates.limit,
      apr: updates.apr,
      min_payment_type: updates.minPaymentType,
      min_payment_value: updates.minPaymentValue,
      starting_value: updates.startingValue,
      promo_apr: updates.promo?.promoApr,
      promo_end_date: updates.promo?.promoEndDate
    }).eq('id', id);

    setData(prev => ({
      ...prev,
      debts: prev.debts.map(d => d.id === id ? { ...d, ...updates } : d)
    }));
  };

  const deleteDebt = (id: string) => {
    supabase.from('debts').delete().eq('id', id).then(() => {
      setData(prev => ({
        ...prev,
        debts: prev.debts.filter(d => d.id !== id)
      }));
    });
  };

  const addBill = async (bill: Omit<Bill, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: newBill } = await supabase.from('bills').insert({
      user_id: session.user.id,
      name: bill.name,
      amount: bill.amount,
      due_date: bill.dueDate,
      is_paid: bill.isPaid,
      auto_pay: bill.autoPay,
      category: bill.category,
      is_recurring: bill.isRecurring,
      frequency: bill.frequency,
      recurring_end_date: bill.recurringEndDate
    }).select().maybeSingle();

    if (newBill) {
      setData(prev => ({
        ...prev,
        bills: [...prev.bills, {
          id: newBill.id,
          ...bill
        }]
      }));
    }
  };

  const updateBill = async (id: string, updates: Partial<Omit<Bill, 'id'>>) => {
    await supabase.from('bills').update({
      name: updates.name,
      amount: updates.amount,
      due_date: updates.dueDate,
      is_paid: updates.isPaid,
      auto_pay: updates.autoPay,
      category: updates.category,
      is_recurring: updates.isRecurring,
      frequency: updates.frequency,
      recurring_end_date: updates.recurringEndDate
    }).eq('id', id);

    setData(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, ...updates } : b)
    }));
  };

  const deleteBill = (id: string) => {
    supabase.from('bills').delete().eq('id', id).then(() => {
      setData(prev => ({
        ...prev,
        bills: prev.bills.filter(b => b.id !== id)
      }));
    });
  };

  const updateUserProfile = async (updates: Partial<UserProfile>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from('user_profiles').update({
      username: updates.username,
      currency: updates.currency
    }).eq('id', session.user.id);

    setData(prev => ({
      ...prev,
      user: { ...prev.user, ...updates }
    }));
  };

  const refreshData = async () => {
    setLoading(true);
    const startTime = Date.now();
    try {
      await loadUserData();
      await fetchMarketData(true);
    } finally {
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, 1500 - elapsed);
      setTimeout(() => {
        setLoading(false);
      }, remainingDelay);
    }
  };

  return (
    <FinanceContext.Provider value={{
      data,
      loading,
      deletingTransactions,
      lastUpdated,
      currentPrices,
      currentBalances,
      historicalPrices,
      getHistory,
      getTotalNetWorth,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      deleteTransactions,
      addAccount,
      updateAccount,
      deleteAccount,
      addDebt,
      updateDebt,
      deleteDebt,
      addBill,
      updateBill,
      deleteBill,
      updateUserProfile,
      refreshData,
      currencySymbol: getCurrencySymbol(data.user.currency),
      gbpUsdRate,
      rateUpdatedAt
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
