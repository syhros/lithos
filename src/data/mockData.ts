
import { subMonths, subDays, format, addDays } from 'date-fns';

export type TransactionType = 'income' | 'expense' | 'investing' | 'debt_payment' | 'transfer';
export type AssetType = 'checking' | 'savings' | 'investment';
export type DebtType = 'credit_card' | 'loan';
export type Frequency = 'weekly' | 'monthly' | 'yearly';
export type Currency = 'GBP' | 'USD' | 'EUR';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  accountId: string;
  // Investment specifics
  symbol?: string;
  quantity?: number;
  price?: number;
  currency?: Currency; // native currency of the asset (e.g. USD for TSLA)
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  currency: Currency;
  institution: string;
  color?: string;
  startingValue: number;
  interestRate?: number;
  symbol?: string;
}

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  limit: number;
  apr: number;
  minPayment: number;
  startingValue: number;
}

export interface Bill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  autoPay: boolean;
  category: string;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  nextDate: string;
  category: string;
  active: boolean;
}

export interface UserProfile {
    username: string;
    currency: Currency;
    notifications: number;
}

export interface MockData {
  transactions: Transaction[];
  assets: Asset[];
  debts: Debt[];
  bills: Bill[];
  recurring: Recurring[];
  user: UserProfile;
}

// Current Market Prices for Simulation (Fallback if API fails)
export const currentStockPrices: Record<string, number> = {
    'SPY': 445.20,
    'BTC-USD': 36500.00,
    'TSLA': 240.50,
    'AAPL': 178.35,
    'NVDA': 460.10,
    'VUSA.L': 62.50
};

// --- Generator Logic ---

const generateLedger = (): Transaction[] => {
    const transactions: Transaction[] = [];
    const today = new Date();
    
    // Explicit Account IDs
    const CHECKING_ID = '1';
    const SAVINGS_ID = '2';
    const STOCK_ID = '3';
    const DEBT_ID = '4';

    // 2. Monthly Loop (12 months)
    for (let i = 12; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const dateStr = (dayOffset: number) => addDays(monthDate, dayOffset).toISOString();

        // --- INCOME ---
        transactions.push({ 
            id: `inc-${i}`, 
            date: dateStr(1), 
            description: 'Tech Solutions Ltd', 
            amount: 4200, 
            type: 'income', 
            category: 'Salary', 
            accountId: CHECKING_ID 
        });

        // --- EXPENSES ---
        transactions.push({ 
            id: `exp-gro-${i}`, 
            date: dateStr(5), 
            description: 'Waitrose & Partners', 
            amount: -450, 
            type: 'expense', 
            category: 'Groceries', 
            accountId: CHECKING_ID 
        });
        
        transactions.push({ 
            id: `exp-tfl-${i}`, 
            date: dateStr(15), 
            description: 'TFL Travel', 
            amount: -120, 
            type: 'expense', 
            category: 'Transport', 
            accountId: CHECKING_ID 
        });

        // --- SAVINGS ---
        transactions.push({ 
             id: `sav-out-${i}`, 
             date: dateStr(2), 
             description: 'Transfer to Savings', 
             amount: -800, 
             type: 'transfer', 
             category: 'Transfer', 
             accountId: CHECKING_ID 
        });
        transactions.push({ 
            id: `sav-in-${i}`, 
            date: dateStr(2), 
            description: 'Monthly Savings', 
            amount: 800, 
            type: 'transfer', 
            category: 'Transfer', 
            accountId: SAVINGS_ID 
        });

        // --- INVESTING ---
        transactions.push({
            id: `invest-fund-${i}`,
            date: dateStr(10),
            description: 'Transfer to Vanguard',
            amount: -1000,
            type: 'transfer', 
            category: 'Investments',
            accountId: CHECKING_ID
        });

        // VUSA.L Purchase (Vanguard S&P 500 - GBP listed on LSE)
        const vusaPrice = 58 + (Math.random() * 8);
        const vusaQty = 600 / vusaPrice;

        transactions.push({
            id: `buy-vusa-${i}`,
            date: dateStr(11),
            description: 'Buy VUSA.L',
            amount: 600,
            type: 'investing',
            category: 'Buy',
            accountId: STOCK_ID,
            symbol: 'VUSA.L',
            quantity: vusaQty,
            price: vusaPrice,
            currency: 'GBP'
        });

        // TSLA Purchase (USD-denominated)
        if (i % 2 === 0) {
             const tslaPrice = 180 + (Math.random() * 80);
             const tslaQty = 400 / tslaPrice;
             transactions.push({
                id: `buy-tsla-${i}`,
                date: dateStr(14),
                description: 'Buy TSLA',
                amount: 400,
                type: 'investing',
                category: 'Buy',
                accountId: STOCK_ID,
                symbol: 'TSLA',
                quantity: tslaQty,
                price: tslaPrice,
                currency: 'USD'
            });
        }

        // --- DEBT ---
        transactions.push({ 
            id: `debt-use-${i}`, 
            date: dateStr(12), 
            description: 'Amex Spend', 
            amount: 600, 
            type: 'expense', 
            category: 'General', 
            accountId: DEBT_ID 
        });
        
        transactions.push({
            id: `debt-pay-out-${i}`,
            date: dateStr(24),
            description: 'Amex Payment',
            amount: -600,
            type: 'debt_payment',
            category: 'Payment',
            accountId: CHECKING_ID
        });
        
        transactions.push({ 
            id: `debt-pay-in-${i}`, 
            date: dateStr(25), 
            description: 'Payment Received', 
            amount: -600, 
            type: 'debt_payment', 
            category: 'Payment', 
            accountId: DEBT_ID 
        });
    }

    return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const initialData: MockData = {
  user: {
    username: 'Alex Sterling',
    currency: 'GBP',
    notifications: 5
  },
  assets: [
    { id: '1', name: 'Monzo Current', type: 'checking', currency: 'GBP', institution: 'Monzo', color: '#00f2ad', startingValue: 2500.00 },
    { id: '2', name: 'Marcus Savings', type: 'savings', currency: 'GBP', institution: 'Marcus', color: '#d4af37', startingValue: 12000.00, interestRate: 5.1 },
    { id: '3', name: 'Vanguard ISA', type: 'investment', currency: 'GBP', institution: 'Vanguard', color: '#3b82f6', startingValue: 0.00 }, // Started at 0, filled via txs
  ],
  debts: [
    { id: '4', name: 'Amex Platinum', type: 'credit_card', limit: 15000, apr: 28.9, minPayment: 100, startingValue: 450.00 }
  ],
  transactions: generateLedger(),
  bills: [
    { id: '1', name: 'Council Tax', amount: 145.00, dueDate: '2023-11-01', isPaid: true, autoPay: true, category: 'Housing' },
    { id: '2', name: 'Electricity', amount: 85.40, dueDate: '2023-11-15', isPaid: false, autoPay: true, category: 'Utilities' },
    { id: '3', name: 'Water', amount: 32.00, dueDate: '2023-11-20', isPaid: false, autoPay: false, category: 'Utilities' },
    { id: '4', name: 'Internet', amount: 45.00, dueDate: '2023-11-22', isPaid: false, autoPay: true, category: 'Utilities' },
    { id: '5', name: 'Adobe CC', amount: 54.99, dueDate: '2023-11-25', isPaid: false, autoPay: true, category: 'Software' },
    { id: '6', name: 'Insurance', amount: 22.50, dueDate: '2023-11-28', isPaid: false, autoPay: true, category: 'Insurance' }
  ],
  recurring: [
    { id: '1', name: 'Netflix', amount: 15.99, frequency: 'monthly', nextDate: '2023-11-29', category: 'Entertainment', active: true },
    { id: '2', name: 'PureGym', amount: 24.99, frequency: 'monthly', nextDate: '2023-11-29', category: 'Health', active: true }
  ],
};
