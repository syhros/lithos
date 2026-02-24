import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { MockData, Transaction, Asset, Debt, Bill, UserProfile, currentStockPrices as fallbackPrices, TransactionType, AssetType, Currency, DebtType, Frequency, MinPaymentType } from '../data/mockData';
import { subDays, format } from 'date-fns';
import { supabase } from '../lib/supabase';

export type CardSortOrder = 'az' | 'highest' | 'date';

export interface SortOrders {
  accounts: CardSortOrder;
  investments: CardSortOrder;
  debts: CardSortOrder;
}

const DEFAULT_SORT_ORDERS: SortOrders = {
  accounts: 'highest',
  investments: 'highest',
  debts: 'highest',
};

interface MarketData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name?: string;
}

export interface HistoricalPricePoint {
  open: number | null;
  close: number;
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

export type HistoryRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'all';

interface FinanceContextType {
  data: MockData;
  loading: boolean;
  deletingTransactions: boolean;
  lastUpdated: Date;

  currentPrices: Record<string, MarketData>;
  currentBalances: { [key: string]: number };
  // historicalPrices[symbol][date] = { open, close }
  historicalPrices: Record<string, Record<string, HistoricalPricePoint>>;

  getHistory: (range: HistoryRange) => HistoricalPoint[];
  getTotalNetWorth: () => number;

  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<void>;
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

  sortOrders: SortOrders;
  updateSortOrder: (page: keyof SortOrders, order: CardSortOrder) => Promise<void>;

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

const getCurrencyFromTransactions = (symbol: string, transactions: Transaction[]): string => {
  const tx = transactions.find(t => t.symbol === symbol && t.currency);
  return tx?.currency || 'GBP';
};

const getEarliestTxDate = (symbol: string, transactions: Transaction[]): string => {
  const txs = transactions.filter(t => t.symbol === symbol && t.date);
  if (txs.length === 0) return format(subDays(new Date(), 365), 'yyyy-MM-dd');
  const earliest = txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date);
  return earliest.substring(0, 10);
};

const getMostRecentClose = (history: Record<string, HistoricalPricePoint>): number | undefined => {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return undefined;
  return history[dates[dates.length - 1]].close;
};

// Get the close price for a given date, falling back to nearest prior close.
export const getCloseForDate = (
  history: Record<string, HistoricalPricePoint>,
  dateStr: string
): number | undefined => {
  if (history[dateStr]) return history[dateStr].close;
  const dates = Object.keys(history).sort();
  const latest = dates.filter(d => d <= dateStr).pop();
  if (latest) return history[latest].close;
  return dates.length > 0 ? history[dates[0]].close : undefined;
};

// Get the open price for today specifically.
export const getTodayOpen = (
  history: Record<string, HistoricalPricePoint>,
  todayStr: string
): number | null => {
  return history[todayStr]?.open ?? null;
};

const generateSyntheticHistory = (currentPrice: number): Record<string, HistoricalPricePoint> => {
  const history: Record<string, HistoricalPricePoint> = {};
  const today = new Date();
  const volatility = 0.015;
  const closes: number[] = [currentPrice];
  for (let i = 1; i < 365; i++) {
    const prev = closes[i - 1];
    closes.push(prev * (1 + (Math.random() * volatility * 2 - volatility)));
  }
  closes.reverse();
  for (let i = 0; i < 365; i++) {
    const d = subDays(today, i);
    const close = closes[i];
    // Synthetic open: slight random offset from close
    const open = close * (1 + (Math.random() * 0.01 - 0.005));
    history[format(d, 'yyyy-MM-dd')] = { open: parseFloat(open.toFixed(6)), close: parseFloat(close.toFixed(6)) };
  }
  return history;
};

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
  const [historicalPrices, setHistoricalPrices] = useState<Record<string, Record<string, HistoricalPricePoint>>>({});
  const [gbpUsdRate, setGbpUsdRate] = useState<number>(0);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string>('');
  const [sortOrders, setSortOrders] = useState<SortOrders>(DEFAULT_SORT_ORDERS);

  const fetchFxRate = async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    try {
      const token = await getAuthToken();
      await fetch(`${supabaseUrl}/functions/v1/fx-rate`, { headers: { 'Authorization': `Bearer ${token}` } });
    } catch (e) { console.info('FX rate refresh failed'); }
    try {
      const { data } = await supabase.from('exchange_rates').select('rate, updated_at').eq('from_currency', 'GBP').eq('to_currency', 'USD').maybeSingle();
      if (data?.rate && data.rate > 0) { setGbpUsdRate(Number(data.rate)); setRateUpdatedAt(data.updated_at); }
    } catch (e) { console.info('Failed to load FX rate from database'); }
  };

  const loadUserData = async (isInitialLoad: boolean = false, suppressLoadingOff: boolean = false) => {
    if (!suppressLoadingOff) setLoading(true);
    const startTime = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!suppressLoadingOff) setLoading(false); return; }
      const userId = session.user.id;

      let allTransactions: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data: txBatch, error: txError } = await supabase.from('transactions').select('*').eq('user_id', userId).range(offset, offset + pageSize - 1);
        if (txError || !txBatch) { hasMore = false; }
        else { allTransactions = allTransactions.concat(txBatch); hasMore = txBatch.length === pageSize; offset += pageSize; }
      }

      const [{ data: profile }, { data: accounts }, { data: debts }, { data: bills }] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('accounts').select('*').eq('user_id', userId),
        supabase.from('debts').select('*').eq('user_id', userId),
        supabase.from('bills').select('*').eq('user_id', userId)
      ]);

      if (profile?.sort_orders) {
        try {
          const saved = typeof profile.sort_orders === 'string' ? JSON.parse(profile.sort_orders) : profile.sort_orders;
          setSortOrders({ ...DEFAULT_SORT_ORDERS, ...saved });
        } catch (_) {}
      }

      const mappedAccounts: Asset[] = (accounts || []).map(a => ({
        id: a.id, name: a.name, type: a.type as AssetType, currency: a.currency as Currency,
        institution: a.institution, color: a.color, startingValue: parseFloat(a.starting_value),
        interestRate: a.interest_rate ? parseFloat(a.interest_rate) : undefined,
        symbol: a.symbol, isClosed: a.is_closed, openedDate: a.opened_date, closedDate: a.closed_date
      }));

      const mappedTransactions: Transaction[] = (allTransactions || []).map(t => ({
        id: t.id, date: t.date, description: t.description,
        amount: parseFloat(t.amount), type: t.type as TransactionType,
        category: t.category,
        accountId: t.account_id || t.debt_id || undefined,
        accountToId: t.account_to_id || undefined,
        notes: t.notes ?? undefined, symbol: t.symbol,
        quantity: t.quantity ? parseFloat(t.quantity) : undefined,
        price: t.price ? parseFloat(t.price) : undefined, currency: t.currency
      }));

      const mappedDebts: Debt[] = (debts || []).map(d => ({
        id: d.id, name: d.name, type: d.type as DebtType,
        limit: parseFloat(d.credit_limit), apr: parseFloat(d.apr),
        minPaymentType: d.min_payment_type as MinPaymentType,
        minPaymentValue: parseFloat(d.min_payment_value),
        startingValue: parseFloat(d.starting_value),
        promo: d.promo_apr ? { promoApr: parseFloat(d.promo_apr), promoEndDate: d.promo_end_date } : undefined
      }));

      const mappedBills: Bill[] = (bills || []).map(b => ({
        id: b.id, name: b.name, amount: parseFloat(b.amount), dueDate: b.due_date,
        isPaid: b.is_paid, autoPay: b.auto_pay, category: b.category,
        isRecurring: b.is_recurring, frequency: b.frequency as Frequency | undefined,
        recurringEndDate: b.recurring_end_date
      }));

      setData({
        transactions: mappedTransactions, assets: mappedAccounts,
        debts: mappedDebts, bills: mappedBills, recurring: [],
        user: { username: profile?.username || '', currency: profile?.currency || 'GBP', notifications: 0 }
      });
      setLastUpdated(new Date());
      await fetchMarketData(false, mappedTransactions);

      if (isInitialLoad) {
        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, 2000 - elapsed);
        if (remainingDelay > 0) await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      if (!suppressLoadingOff) setLoading(false);
    }
  };

  const fetchMarketData = async (force: boolean = false, txOverride?: Transaction[]) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const activeTxs = txOverride ?? data.transactions;
      const uniqueSymbols = Array.from(new Set(activeTxs.filter(t => t.type === 'investing' && t.symbol).map(t => t.symbol!)));
      if (uniqueSymbols.length === 0) return;

      const symbolCurrencyMap: Record<string, string> = {};
      uniqueSymbols.forEach(sym => { symbolCurrencyMap[sym] = getCurrencyFromTransactions(sym, activeTxs); });
      const symbolFromDateMap: Record<string, string> = {};
      uniqueSymbols.forEach(sym => { symbolFromDateMap[sym] = getEarliestTxDate(sym, activeTxs); });

      const lastSync = localStorage.getItem('lithos_last_sync');
      const now = Date.now();
      const shouldFetch = force || !lastSync || (now - parseInt(lastSync) > 30 * 60 * 1000);

      if (shouldFetch) {
        const token = await getAuthToken();
        const authHeader = { 'Authorization': `Bearer ${token}` };
        let fetchedPrices: any = {};
        let liveApiAvailable = false;

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/live-prices?symbols=${uniqueSymbols.join(',')}`, { headers: authHeader });
          if (res.ok) {
            const rawPrices = await res.json();
            uniqueSymbols.forEach(sym => {
              if (rawPrices[sym]) fetchedPrices[sym] = { ...rawPrices[sym], currency: symbolCurrencyMap[sym] || rawPrices[sym].currency || 'GBP', name: rawPrices[sym].name ?? sym };
            });
            liveApiAvailable = true;
          } else { console.warn(`live-prices returned ${res.status}`); }
        } catch (e) { console.warn('live-prices fetch failed, will use cached prices:', e); }

        localStorage.setItem('lithos_last_sync', now.toString());
        const historyCache: Record<string, Record<string, HistoricalPricePoint>> = {};

        await Promise.all(uniqueSymbols.map(async sym => {
          let history: Record<string, HistoricalPricePoint> = {};
          const fromDate = symbolFromDateMap[sym];

          if (liveApiAvailable) {
            try {
              const hRes = await fetch(`${supabaseUrl}/functions/v1/price-history?symbol=${sym}&from=${fromDate}`, { headers: authHeader });
              if (hRes.ok) {
                const response = await hRes.json();
                const rows: { date: string; open: number | null; close: number }[] = response[sym] || [];
                rows.forEach(row => {
                  history[row.date] = { open: row.open ?? null, close: row.close };
                });
              }
            } catch (e) { console.info(`Failed to fetch history for ${sym}:`, e); }
          }

          if (Object.keys(history).length === 0) {
            try {
              let allCached: any[] = []; let offset = 0; let hasMore = true;
              while (hasMore) {
                const { data: cached, error } = await supabase
                  .from('price_history_cache')
                  .select('date, open, close')
                  .eq('symbol', sym)
                  .gte('date', fromDate)
                  .order('date', { ascending: true })
                  .range(offset, offset + 999);
                if (error || !cached || cached.length === 0) { hasMore = false; }
                else { allCached = allCached.concat(cached); hasMore = cached.length === 1000; offset += 1000; }
              }
              if (allCached.length > 0) {
                allCached.forEach((row: { date: string; open: number | null; close: number }) => {
                  history[row.date] = { open: row.open ?? null, close: row.close };
                });
              }
            } catch (e) { console.info(`Supabase cache miss for ${sym}`); }
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

        // Fill in prices for symbols where live fetch returned nothing
        uniqueSymbols.forEach(sym => {
          if (!updatedPrices[sym] || !updatedPrices[sym].price) {
            const hist = historyCache[sym];
            const mostRecentClose = hist ? getMostRecentClose(hist) : undefined;
            if (mostRecentClose !== undefined && mostRecentClose > 0) {
              const dates = Object.keys(hist).sort();
              const prevClose = dates.length >= 2 ? hist[dates[dates.length - 2]].close : mostRecentClose;
              const chg = mostRecentClose - prevClose;
              updatedPrices[sym] = { price: mostRecentClose, change: chg, changePercent: prevClose > 0 ? (chg / prevClose) * 100 : 0, currency: symbolCurrencyMap[sym] || 'GBP', name: sym };
            }
          }
        });

        // Recompute change % vs yesterday's close
        uniqueSymbols.forEach(sym => {
          const hist = historyCache[sym];
          const currentPrice = updatedPrices[sym]?.price;
          if (hist && currentPrice && updatedPrices[sym]) {
            const prevClose = hist[yesterday]?.close;
            if (prevClose && prevClose > 0) {
              const chg = currentPrice - prevClose;
              updatedPrices[sym] = { ...updatedPrices[sym], change: chg, changePercent: (chg / prevClose) * 100 };
            }
          }
        });

        setCurrentPrices(updatedPrices);
        localStorage.setItem('lithos_current_prices', JSON.stringify(updatedPrices));
      }
    } catch (error) { console.error('Market data sync failed:', error); }
  };

  useEffect(() => {
    const cachedPrices = localStorage.getItem('lithos_current_prices');
    if (cachedPrices) { try { setCurrentPrices(JSON.parse(cachedPrices)); } catch (e) {} }
    const cachedHistory = localStorage.getItem('lithos_historical_prices');
    if (cachedHistory) {
      try {
        const parsed = JSON.parse(cachedHistory);
        // Migrate old flat number format { date: number } -> { date: { open, close } }
        const migrated: Record<string, Record<string, HistoricalPricePoint>> = {};
        for (const [sym, hist] of Object.entries(parsed)) {
          migrated[sym] = {};
          for (const [date, val] of Object.entries(hist as Record<string, any>)) {
            if (typeof val === 'number') {
              migrated[sym][date] = { open: null, close: val };
            } else {
              migrated[sym][date] = val as HistoricalPricePoint;
            }
          }
        }
        setHistoricalPrices(migrated);
      } catch (e) {}
    }

    (async () => { await fetchFxRate(); await loadUserData(true); })();

    const msUntilNextHour = (60 - new Date().getMinutes()) * 60 * 1000 - new Date().getSeconds() * 1000;
    const firstTimeout = setTimeout(() => { fetchFxRate(); const i = setInterval(fetchFxRate, 60 * 60 * 1000); return () => clearInterval(i); }, msUntilNextHour);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') { loadUserData(false); }
    });

    return () => { clearTimeout(firstTimeout); subscription.unsubscribe(); };
  }, []);

  const getHoldingsByAccount = (accountId: string) => {
    const userCurrency = data.user.currency || 'GBP';
    const map = new Map<string, any>();
    data.transactions.filter(t => t.type === 'investing' && t.accountId === accountId && t.symbol && t.quantity).forEach(t => {
      if (!map.has(t.symbol)) map.set(t.symbol, { symbol: t.symbol, quantity: 0, totalCost: 0, currency: t.currency || 'GBP' });
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
      const displayPrice = stockIsGbx ? nativePrice / 100 : nativePrice * fxRate;
      return { ...h, nativeCurrency, nativePrice, displayPrice, currentValue: h.quantity * displayPrice };
    });
  };

  const currentBalances = useMemo(() => {
    const balances: { [key: string]: number } = {};
    const debtIdSet = new Set(data.debts.map(d => d.id));
    const assetIdSet = new Set(data.assets.map(a => a.id));

    data.assets.forEach(asset => {
      if (asset.type === 'investment') {
        const holdings = getHoldingsByAccount(asset.id);
        balances[asset.id] = holdings.reduce((sum, h) => sum + h.currentValue, 0);
      } else {
        balances[asset.id] = asset.startingValue;
      }
    });

    data.transactions.forEach(tx => {
      if (tx.type === 'investing') return;
      if (tx.accountId) {
        const fromAcct = data.assets.find(a => a.id === tx.accountId);
        if (fromAcct && fromAcct.type !== 'investment' && !debtIdSet.has(tx.accountId)) {
          if (balances[tx.accountId] !== undefined) balances[tx.accountId] += tx.amount;
        }
      }
      if (tx.type === 'transfer' && tx.accountToId && assetIdSet.has(tx.accountToId)) {
        const toAcct = data.assets.find(a => a.id === tx.accountToId);
        if (toAcct && toAcct.type !== 'investment') {
          if (balances[tx.accountToId] !== undefined) balances[tx.accountToId] += Math.abs(tx.amount);
        }
      }
    });

    data.debts.forEach(debt => { balances[debt.id] = debt.startingValue; });
    data.transactions.forEach(tx => {
      if (!tx.accountId || !debtIdSet.has(tx.accountId)) return;
      balances[tx.accountId] += tx.amount;
    });

    return balances;
  }, [data.assets, data.transactions, data.debts, currentPrices, gbpUsdRate]);

  const getHistory = (range: HistoryRange): HistoricalPoint[] => {
    let days: number;
    if (range === 'all') {
      const allDates = data.transactions.map(t => t.date).filter(Boolean).sort();
      if (allDates.length === 0) { days = 365; }
      else {
        const earliest = new Date(allDates[0]);
        const today = new Date();
        days = Math.ceil((today.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));
        days = Math.max(days, 1);
      }
    } else {
      days = range === '1W' ? 7 : range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : 365;
    }

    const points: HistoricalPoint[] = [];
    const userCurrency = data.user.currency || 'GBP';
    const debtIdSet = new Set(data.debts.map(d => d.id));
    const assetIdSet = new Set(data.assets.map(a => a.id));

    const totalDays = days + 1;
    const maxPoints = 90;
    const step = totalDays > maxPoints ? Math.ceil(totalDays / maxPoints) : 1;

    for (let i = days; i >= 0; i -= step) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      let checking = 0, savings = 0, investing = 0;

      data.assets.forEach(asset => {
        if (asset.type === 'checking') {
          checking += asset.startingValue;
          data.transactions
            .filter(t => t.accountId === asset.id && t.type !== 'investing' && !debtIdSet.has(t.accountId!) && new Date(t.date) <= d)
            .forEach(t => { checking += t.amount; });
          data.transactions
            .filter(t => t.type === 'transfer' && t.accountToId === asset.id && assetIdSet.has(t.accountId ?? '') && new Date(t.date) <= d)
            .forEach(t => { checking += Math.abs(t.amount); });
        } else if (asset.type === 'savings') {
          savings += asset.startingValue;
          data.transactions
            .filter(t => t.accountId === asset.id && t.type !== 'investing' && !debtIdSet.has(t.accountId!) && new Date(t.date) <= d)
            .forEach(t => { savings += t.amount; });
          data.transactions
            .filter(t => t.type === 'transfer' && t.accountToId === asset.id && assetIdSet.has(t.accountId ?? '') && new Date(t.date) <= d)
            .forEach(t => { savings += Math.abs(t.amount); });
        } else if (asset.type === 'investment') {
          const investingTxns = data.transactions.filter(t => t.type === 'investing' && t.accountId === asset.id && t.symbol && t.quantity && new Date(t.date) <= d);
          const holdings = new Map<string, any>();
          investingTxns.forEach(t => {
            if (!holdings.has(t.symbol!)) holdings.set(t.symbol!, { symbol: t.symbol, quantity: 0, currency: t.currency || 'GBP' });
            const h = holdings.get(t.symbol!)!;
            h.quantity += t.quantity || 0;
            if (t.currency) h.currency = t.currency;
          });
          Array.from(holdings.values()).forEach(h => {
            const historicalData = historicalPrices[h.symbol] || {};
            // Use close price for historical chart points
            const priceOnDate = getCloseForDate(historicalData, dateStr);
            if (priceOnDate !== undefined && priceOnDate > 0) {
              const nativeCurrency = h.currency || currentPrices[h.symbol]?.currency || 'GBP';
              const stockIsUsd = nativeCurrency === 'USD';
              const stockIsGbx = nativeCurrency === 'GBX';
              const userIsUsd = userCurrency === 'USD';
              let fxRate = 1;
              if (gbpUsdRate > 0) {
                if (stockIsUsd && !userIsUsd) fxRate = 1 / gbpUsdRate;
                if (!stockIsUsd && userIsUsd) fxRate = gbpUsdRate;
              }
              investing += h.quantity * (stockIsGbx ? priceOnDate / 100 : priceOnDate * fxRate);
            }
          });
        }
      });

      let debts = 0;
      data.debts.forEach(debt => {
        let balance = debt.startingValue;
        data.transactions
          .filter(t => t.accountId === debt.id && new Date(t.date) <= d)
          .forEach(t => { balance += t.amount; });
        debts += balance;
      });

      points.push({ date: dateStr, netWorth: checking + savings + investing - debts, assets: checking + savings + investing, debts, checking, savings, investing });
    }

    const lastPoint = points[points.length - 1];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (!lastPoint || lastPoint.date !== todayStr) {
      let checking = 0, savings = 0, investing = 0;
      data.assets.forEach(asset => {
        if (asset.type !== 'investment') {
          const val = currentBalances[asset.id] || 0;
          if (asset.type === 'checking') checking += val;
          else if (asset.type === 'savings') savings += val;
        } else {
          investing += currentBalances[asset.id] || 0;
        }
      });
      let debts = 0;
      data.debts.forEach(d => { debts += currentBalances[d.id] || 0; });
      points.push({ date: todayStr, netWorth: checking + savings + investing - debts, assets: checking + savings + investing, debts, checking, savings, investing });
    }

    return points;
  };

  const getTotalNetWorth = (): number => {
    const debtIdSet = new Set(data.debts.map(d => d.id));
    let assetTotal = 0; let debtTotal = 0;
    Object.entries(currentBalances).forEach(([id, bal]) => {
      if (debtIdSet.has(id)) debtTotal += bal;
      else assetTotal += bal;
    });
    return assetTotal - debtTotal;
  };

  const addTransaction = async (tx: Omit<Transaction, 'id'>): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const isDebtAccount = data.debts.some(d => d.id === tx.accountId);
    const normalisedDate = tx.date ? tx.date.substring(0, 10) : tx.date;
    const { data: newTx, error } = await supabase.from('transactions').insert({
      user_id: session.user.id,
      account_id: isDebtAccount ? null : (tx.accountId ?? null),
      debt_id: isDebtAccount ? tx.accountId : null,
      account_to_id: tx.accountToId ?? null,
      date: normalisedDate, description: tx.description, amount: tx.amount, type: tx.type,
      category: tx.category, notes: tx.notes ?? null, symbol: tx.symbol ?? null,
      quantity: tx.quantity ?? null, price: tx.price ?? null, currency: tx.currency ?? null,
    }).select().maybeSingle();
    if (error) { console.error('addTransaction: Supabase insert failed:', error); return; }
    if (newTx) {
      setData(prev => ({ ...prev, transactions: [...prev.transactions, {
        id: newTx.id, ...tx, date: normalisedDate,
        accountId: newTx.account_id || newTx.debt_id || tx.accountId,
        accountToId: newTx.account_to_id || tx.accountToId || undefined,
      }] }));
    }
  };

  const updateTransaction = async (id: string, updates: Partial<Omit<Transaction, 'id'>>) => {
    const dbUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'accountId') { const isDebt = data.debts.some(d => d.id === value); dbUpdates['account_id'] = isDebt ? null : value; dbUpdates['debt_id'] = isDebt ? value : null; }
      else if (key === 'accountToId') { dbUpdates['account_to_id'] = value ?? null; }
      else if (key === 'symbol') { dbUpdates['symbol'] = value; }
      else if (key === 'quantity') { dbUpdates['quantity'] = value; }
      else if (key === 'price') { dbUpdates['price'] = value; }
      else if (key === 'currency') { dbUpdates['currency'] = value; }
      else if (key === 'notes') { dbUpdates['notes'] = value ?? null; }
      else { dbUpdates[key] = value; }
    });
    const { error } = await supabase.from('transactions').update(dbUpdates).eq('id', id);
    if (error) { console.error('Failed to update transaction:', error); return; }
    setData(prev => ({ ...prev, transactions: prev.transactions.map(t => t.id === id ? { ...t, ...updates } : t) }));
  };

  const deleteTransaction = (id: string) => {
    supabase.from('transactions').delete().eq('id', id).then(() => {
      setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
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
        if (error) console.error('Error deleting transaction batch:', error);
      }
      setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => !idSet.has(t.id)) }));
    } finally { setDeletingTransactions(false); }
  };

  const addAccount = async (account: Omit<Asset, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: newAccount } = await supabase.from('accounts').insert({ user_id: session.user.id, name: account.name, type: account.type, currency: account.currency, institution: account.institution, color: account.color, starting_value: account.startingValue, interest_rate: account.interestRate, symbol: account.symbol, is_closed: account.isClosed, opened_date: account.openedDate }).select().maybeSingle();
    if (newAccount) setData(prev => ({ ...prev, assets: [...prev.assets, { id: newAccount.id, ...account }] }));
  };

  const updateAccount = async (id: string, updates: Partial<Omit<Asset, 'id'>>) => {
    await supabase.from('accounts').update({ name: updates.name, institution: updates.institution, color: updates.color, interest_rate: updates.interestRate, is_closed: updates.isClosed, closed_date: updates.closedDate }).eq('id', id);
    setData(prev => ({ ...prev, assets: prev.assets.map(a => a.id === id ? { ...a, ...updates } : a) }));
  };

  const deleteAccount = (id: string) => {
    supabase.from('accounts').delete().eq('id', id).then(() => {
      setData(prev => ({ ...prev, assets: prev.assets.filter(a => a.id !== id), transactions: prev.transactions.filter(t => t.accountId !== id) }));
    });
  };

  const addDebt = async (debt: Omit<Debt, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: newDebt } = await supabase.from('debts').insert({ user_id: session.user.id, name: debt.name, type: debt.type, credit_limit: debt.limit, apr: debt.apr, min_payment_type: debt.minPaymentType, min_payment_value: debt.minPaymentValue, starting_value: debt.startingValue, promo_apr: debt.promo?.promoApr, promo_end_date: debt.promo?.promoEndDate }).select().maybeSingle();
    if (newDebt) setData(prev => ({ ...prev, debts: [...prev.debts, { id: newDebt.id, ...debt }] }));
  };

  const updateDebt = async (id: string, updates: Partial<Omit<Debt, 'id'>>) => {
    await supabase.from('debts').update({ name: updates.name, type: updates.type, credit_limit: updates.limit, apr: updates.apr, min_payment_type: updates.minPaymentType, min_payment_value: updates.minPaymentValue, starting_value: updates.startingValue, promo_apr: updates.promo?.promoApr, promo_end_date: updates.promo?.promoEndDate }).eq('id', id);
    setData(prev => ({ ...prev, debts: prev.debts.map(d => d.id === id ? { ...d, ...updates } : d) }));
  };

  const deleteDebt = (id: string) => {
    supabase.from('accounts').delete().eq('id', id).then(() => {
      setData(prev => ({ ...prev, debts: prev.debts.filter(d => d.id !== id) }));
    });
  };

  const addBill = async (bill: Omit<Bill, 'id'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: newBill } = await supabase.from('bills').insert({ user_id: session.user.id, name: bill.name, amount: bill.amount, due_date: bill.dueDate, is_paid: bill.isPaid, auto_pay: bill.autoPay, category: bill.category, is_recurring: bill.isRecurring, frequency: bill.frequency, recurring_end_date: bill.recurringEndDate }).select().maybeSingle();
    if (newBill) setData(prev => ({ ...prev, bills: [...prev.bills, { id: newBill.id, ...bill }] }));
  };

  const updateBill = async (id: string, updates: Partial<Omit<Bill, 'id'>>) => {
    await supabase.from('bills').update({ name: updates.name, amount: updates.amount, due_date: updates.dueDate, is_paid: updates.isPaid, auto_pay: updates.autoPay, category: updates.category, is_recurring: updates.isRecurring, frequency: updates.frequency, recurring_end_date: updates.recurringEndDate }).eq('id', id);
    setData(prev => ({ ...prev, bills: prev.bills.map(b => b.id === id ? { ...b, ...updates } : b) }));
  };

  const deleteBill = (id: string) => {
    supabase.from('bills').delete().eq('id', id).then(() => {
      setData(prev => ({ ...prev, bills: prev.bills.filter(b => b.id !== id) }));
    });
  };

  const updateUserProfile = async (updates: Partial<UserProfile>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from('user_profiles').update({ username: updates.username, currency: updates.currency }).eq('id', session.user.id);
    setData(prev => ({ ...prev, user: { ...prev.user, ...updates } }));
  };

  const updateSortOrder = async (page: keyof SortOrders, order: CardSortOrder) => {
    const next = { ...sortOrders, [page]: order };
    setSortOrders(next);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from('user_profiles').update({ sort_orders: next }).eq('id', session.user.id);
    } catch (e) { console.error('Failed to save sort order:', e); }
  };

  const refreshData = async () => {
    setLoading(true);
    const startTime = Date.now();
    try {
      await loadUserData(false, true);
      await fetchMarketData(true);
    } finally {
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, 2000 - elapsed);
      if (remainingDelay > 0) await new Promise(resolve => setTimeout(resolve, remainingDelay));
      setLoading(false);
    }
  };

  return (
    <FinanceContext.Provider value={{
      data, loading, deletingTransactions, lastUpdated,
      currentPrices, currentBalances, historicalPrices,
      getHistory, getTotalNetWorth,
      addTransaction, updateTransaction, deleteTransaction, deleteTransactions,
      addAccount, updateAccount, deleteAccount,
      addDebt, updateDebt, deleteDebt,
      addBill, updateBill, deleteBill,
      updateUserProfile, refreshData,
      sortOrders, updateSortOrder,
      currencySymbol: getCurrencySymbol(data.user.currency),
      gbpUsdRate, rateUpdatedAt
    } as any}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within FinanceProvider');
  return context;
};
