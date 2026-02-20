import React, { useState, useEffect, useMemo } from 'react';
import { X, Calculator, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { TransactionType, Currency, Transaction } from '../data/mockData';


interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTransaction?: Transaction | null;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, editTransaction }) => {
  const { data, addTransaction, updateTransaction, currencySymbol, gbpUsdRate } = useFinance();
  
  // -- Form State --
  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5)); // HH:MM
  
  // General Fields
  // 'merchant' acts as Description/Reference depending on type
  const [merchant, setMerchant] = useState(''); 
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(''); // "Account From" for transfers
  
  // Transfer / Debt Specifics
  const [accountToId, setAccountToId] = useState('');

  // Investing Specifics
  const [ticker, setTicker] = useState('');
  const [assetName, setAssetName] = useState('');
  const [shares, setShares] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [assetType, setAssetType] = useState('Stock');
  const [investCurrency, setInvestCurrency] = useState<Currency>('GBP');

  // Validation
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // -- Derived Data for Autocomplete --
  const uniqueCategories = useMemo(() => Array.from(new Set(data.transactions.map(t => t.category))).sort(), [data.transactions]);
  const uniqueMerchants = useMemo(() => Array.from(new Set(data.transactions.filter(t => t.type !== 'investing').map(t => t.description))).sort(), [data.transactions]);
  
  // Ticker History for Auto-population
  const tickerMap = useMemo(() => {
    const map: Record<string, string> = {};
    data.transactions.forEach(t => {
        if (t.type === 'investing' && t.symbol && t.description) {
            map[t.symbol.toUpperCase()] = t.description;
        }
    });
    return map;
  }, [data.transactions]);

  // -- Effects --

  // Auto-populate Asset Name when Ticker changes
  useEffect(() => {
    if (type === 'investing' && ticker.toUpperCase() in tickerMap) {
        setAssetName(tickerMap[ticker.toUpperCase()]);
    }
  }, [ticker, type, tickerMap]);

  // Auto-calculate amount for investing (always stored in GBP)
  useEffect(() => {
    if (type === 'investing') {
        const s = parseFloat(shares) || 0;
        const p = parseFloat(pricePerShare) || 0;
        if (s > 0 && p >= 0) {
            let nativeTotal = s * p;
            let gbpTotal = nativeTotal;
            if (investCurrency === 'USD' && gbpUsdRate > 0) {
              gbpTotal = nativeTotal / gbpUsdRate;
            } else if (investCurrency === 'GBX') {
              gbpTotal = nativeTotal / 100;
            }
            setAmount(gbpTotal.toFixed(2));
        }
    }
  }, [shares, pricePerShare, type, investCurrency, gbpUsdRate]);

  const resetForm = () => {
      setMerchant('');
      setCategory('');
      setAmount('');
      setAccountId('');
      setAccountToId('');
      setTicker('');
      setAssetName('');
      setShares('');
      setPricePerShare('');
      setAssetType('Stock');
      setInvestCurrency('GBP');
      setType('expense');
      setDate(new Date().toISOString().split('T')[0]);
      setTime(new Date().toTimeString().slice(0, 5));
  };

  // Default Category for Debt Payment
  useEffect(() => {
      if (type === 'debt_payment') {
          setCategory('Debt Payment');
      } else if (type === 'transfer') {
          setCategory('Transfer');
      } else {
          setCategory('');
      }
  }, [type]);

  // Populate form when editing
  useEffect(() => {
    if (editTransaction && isOpen) {
      setType(editTransaction.type);
      const [datePart, timePart] = editTransaction.date.split('T');
      setDate(datePart);
      setTime(timePart?.substring(0, 5) || '00:00');
      setMerchant(editTransaction.description);
      setCategory(editTransaction.category);
      setAccountId(editTransaction.accountId);

      if (editTransaction.type === 'investing' && editTransaction.symbol) {
        setTicker(editTransaction.symbol);
        setAssetName(editTransaction.description);
        setShares((Math.abs(editTransaction.quantity || 0)).toString());
        setPricePerShare((editTransaction.price || 0).toString());
        setAssetType(editTransaction.category);
        setInvestCurrency(editTransaction.currency || 'GBP');
        setAmount(Math.abs(editTransaction.amount).toFixed(2));
      } else {
        setAmount(Math.abs(editTransaction.amount).toFixed(2));
      }
    } else {
      resetForm();
    }
  }, [editTransaction, isOpen]);

  if (!isOpen) return null;

  // Helper to get name
  const getAccountName = (id: string) => {
      const a = data.assets.find(x => x.id === id);
      if (a) return a.name;
      const d = data.debts.find(x => x.id === id);
      if (d) return d.name;
      return 'Unknown Account';
  };

  const validate = () => {
    const errors: string[] = [];
    if (!accountId) errors.push('Please select an account');
    if (type === 'investing' && !ticker) errors.push('Please enter a ticker symbol');
    if (type === 'investing' && !shares) errors.push('Please enter the number of shares');
    if (type === 'investing' && pricePerShare === '') errors.push('Please enter the price per share');
    if (type === 'transfer' && !accountToId) errors.push('Please select destination account');
    if (type === 'debt_payment' && !accountToId) errors.push('Please select a debt account');
    if (!amount) errors.push('Please enter an amount');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const fullDate = new Date(`${date}T${time}:00`).toISOString();
    const amountNum = parseFloat(amount);

    // If editing, update the transaction
    if (editTransaction) {
      if (editTransaction.type === 'transfer') {
        // For transfers, update both sides
        const outflowTx = editTransaction;
        const inflowTx = data.transactions.find(t =>
          t.type === 'transfer' &&
          t.accountId === accountToId &&
          t.description.includes(getAccountName(accountId)) &&
          Math.abs(t.amount - amountNum) < 0.01
        );

        await updateTransaction(outflowTx.id, {
          date: fullDate,
          description: merchant || `Transfer to ${getAccountName(accountToId)}`,
          amount: -Math.abs(amountNum),
          category: 'Transfer',
          accountId: accountId,
        });

        if (inflowTx) {
          await updateTransaction(inflowTx.id, {
            date: fullDate,
            description: merchant || `Transfer from ${getAccountName(accountId)}`,
            amount: Math.abs(amountNum),
            category: 'Transfer',
            accountId: accountToId,
          });
        }
      } else if (editTransaction.type === 'debt_payment') {
        // For debt payments, update both sides
        const outflowTx = editTransaction;
        const debtTx = data.transactions.find(t =>
          t.type === 'debt_payment' &&
          t.accountId === accountToId &&
          new Date(t.date).getTime() === new Date(outflowTx.date).getTime()
        );

        await updateTransaction(outflowTx.id, {
          date: fullDate,
          description: `Payment to ${getAccountName(accountToId)}`,
          amount: -Math.abs(amountNum),
          category: category || 'Debt Payment',
          accountId: accountId,
        });

        if (debtTx) {
          await updateTransaction(debtTx.id, {
            date: fullDate,
            description: `Payment from ${getAccountName(accountId)}`,
            amount: -Math.abs(amountNum),
            category: category || 'Debt Payment',
            accountId: accountToId,
          });
        }
      } else {
        // For other types, update single transaction
        await updateTransaction(editTransaction.id, {
          date: fullDate,
          description: merchant,
          amount: type === 'expense' ? -Math.abs(amountNum) : Math.abs(amountNum),
          category,
          accountId,
          symbol: type === 'investing' ? ticker.toUpperCase() : undefined,
          quantity: type === 'investing' ? parseFloat(shares) : undefined,
          price: type === 'investing' ? parseFloat(pricePerShare) : undefined,
          currency: type === 'investing' ? investCurrency : undefined,
        });
      }
      resetForm();
      onClose();
      return;
    }

    // --- Logic Switch based on Type (for new transactions) ---

    if (type === 'transfer') {
        // Double Entry:
        // 1. Outflow from Source
        addTransaction({
            date: fullDate,
            description: merchant || `Transfer to ${getAccountName(accountToId)}`, // Use Reference if provided
            amount: -Math.abs(amountNum),
            type: 'transfer',
            category: 'Transfer',
            accountId: accountId
        });
        // 2. Inflow to Dest
        addTransaction({
            date: fullDate,
            description: merchant || `Transfer from ${getAccountName(accountId)}`,
            amount: Math.abs(amountNum),
            type: 'transfer',
            category: 'Transfer',
            accountId: accountToId
        });

    } else if (type === 'debt_payment') {
        // Double Entry:
        // 1. Outflow from Source (Asset)
        addTransaction({
            date: fullDate,
            description: `Payment to ${getAccountName(accountToId)}`,
            amount: -Math.abs(amountNum),
            type: 'debt_payment',
            category: category || 'Debt Payment',
            accountId: accountId
        });
        // 2. Reduction of Debt (Debt Account)
        addTransaction({
            date: fullDate,
            description: `Payment from ${getAccountName(accountId)}`,
            amount: -Math.abs(amountNum),
            type: 'debt_payment',
            category: category || 'Debt Payment',
            accountId: accountToId
        });

    } else if (type === 'investing') {
        const nativePrice = parseFloat(pricePerShare);
        addTransaction({
            date: fullDate,
            description: assetName,
            amount: amountNum, // stored in GBP (auto-calculated from price, including /100 for GBX)
            type: 'investing',
            category: assetType,
            accountId: accountId,
            symbol: ticker.toUpperCase(),
            quantity: parseFloat(shares),
            price: nativePrice,        // native currency price (pence for GBX)
            currency: investCurrency,  // 'GBX', 'USD', 'GBP', etc.
        });

    } else {
        // Income / Expense
        let finalAmount = Math.abs(amountNum);
        if (type === 'expense') finalAmount = -finalAmount;

        addTransaction({
            date: fullDate,
            description: merchant,
            amount: finalAmount,
            type: type,
            category: category || 'General',
            accountId: accountId
        });
    }

    resetForm();
    onClose();
  };

  // -- Render Logic --

  const isInvesting = type === 'investing';
  const isTransfer = type === 'transfer';
  const isDebtPayment = type === 'debt_payment';
  const isGbxInvest = investCurrency === 'GBX';

  // Price symbol for Price/Share input (native to the stock)
  const priceSymbol = investCurrency === 'USD' ? '$' : investCurrency === 'EUR' ? '\u20ac' : investCurrency === 'GBX' ? 'p' : '\u00a3';

  // Computed native total (before GBP conversion) for display in hint
  const nativeTotal = (parseFloat(shares) || 0) * (parseFloat(pricePerShare) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-xl p-0 shadow-2xl rounded-sm max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] sticky top-0 z-10">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">
            {editTransaction
              ? 'Edit Transaction'
              : isInvesting ? 'Add Investment' : isTransfer ? 'Transfer Funds' : isDebtPayment ? 'Record Payment' : 'Add Transaction'}
          </h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-8 space-y-6">

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-magma/10 border border-magma/50 rounded-sm p-3">
              <ul className="text-xs text-magma space-y-1">
                {validationErrors.map((error, i) => (
                  <li key={i}>\u2022 {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Row 1: Type, Date, Time */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs font-mono text-iron-dust mb-2">Type</label>
              <select
                value={type}
                onChange={e => {
                    setType(e.target.value as TransactionType);
                    setAccountId('');
                    setAccountToId('');
                }}
                disabled={!!editTransaction}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="debt_payment">Debt Payment</option>
                <option value="investing">Investing</option>
              </select>
            </div>
            <div className="col-span-7 md:col-span-5">
              <label className="block text-xs font-mono text-iron-dust mb-2">Date</label>
              <input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
              />
            </div>
            <div className="col-span-5 md:col-span-3">
               <label className="block text-xs font-mono text-iron-dust mb-2">Time</label>
               <input 
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
              />
            </div>
          </div>

          <hr className="border-white/5" />

          {/* === INVESTING LAYOUT === */}
          {isInvesting && (
             <>
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-4">
                        <label className="block text-xs font-mono text-iron-dust mb-2">Ticker</label>
                        <input 
                            type="text" 
                            placeholder="AAPL"
                            value={ticker}
                            onChange={e => setTicker(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono uppercase" 
                        />
                    </div>
                    <div className="col-span-8">
                        <label className="block text-xs font-mono text-iron-dust mb-2">Asset Name</label>
                        <input 
                            type="text" 
                            placeholder="e.g. Apple Inc."
                            value={assetName}
                            onChange={e => setAssetName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" 
                        />
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-6 md:col-span-3">
                        <label className="block text-xs font-mono text-iron-dust mb-2">Shares</label>
                        <input
                            type="number"
                            placeholder="0.00000000"
                            step="any"
                            value={shares}
                            onChange={e => setShares(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                        />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                        <label className="block text-xs font-mono text-iron-dust mb-2">Currency</label>
                        <select
                            value={investCurrency}
                            onChange={e => setInvestCurrency(e.target.value as Currency)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        >
                            <option value="GBP">GBP (\u00a3)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (\u20ac)</option>
                            <option value="GBX">GBX (p)</option>
                        </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                         <label className="block text-xs font-mono text-iron-dust mb-2">Price / Share {isGbxInvest ? '(pence)' : ''}</label>
                         <div className="relative">
                            <span className="absolute left-3 top-3 text-iron-dust text-xs">
                                {priceSymbol}
                            </span>
                            <input
                                type="number"
                                placeholder="0.00"
                                step="any"
                                value={pricePerShare}
                                onChange={e => setPricePerShare(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                            />
                         </div>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                        <label className="block text-xs font-mono text-iron-dust mb-2">Asset Type</label>
                        <select
                            value={assetType}
                            onChange={e => setAssetType(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        >
                            <option value="Stock">Stock</option>
                            <option value="Crypto">Crypto</option>
                            <option value="ETF">ETF</option>
                            <option value="Pension">Pension</option>
                            <option value="REIT">REIT</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-[1.2fr_1fr] gap-4">
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">Investing Account</label>
                        <select
                            value={accountId}
                            onChange={e => setAccountId(e.target.value)}
                            className={clsx("w-full bg-black/20 border p-3 text-sm text-white rounded-sm focus:outline-none", validationErrors.some(e => e.includes('account')) ? 'border-magma/50 focus:border-magma' : 'border-white/10 focus:border-magma')}
                        >
                            <option value="">Select Account...</option>
                            <optgroup label="Investment Accounts">
                                {data.assets.filter(a => a.type === 'investment').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">Category</label>
                        <div className="flex gap-1.5 h-[42px]">
                            {['Buy', 'Sell', 'Dividend'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={clsx(
                                        'flex-1 px-3 py-2 text-xs font-mono font-bold uppercase rounded-sm transition-colors',
                                        category === cat
                                            ? 'bg-magma text-white border border-magma'
                                            : 'bg-white/5 text-iron-dust border border-white/10 hover:border-white/20'
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
             </>
          )}

          {/* === TRANSFER & DEBT PAYMENT LAYOUT === */}
          {(isTransfer || isDebtPayment) && (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">Account From</label>
                        <select 
                            value={accountId}
                            onChange={e => setAccountId(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        >
                            <option value="">Select Source...</option>
                            <optgroup label="Liquid Assets">
                                {data.assets.filter(a => a.type !== 'investment').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    
                    {/* Visual Arrow */}
                    <div className="flex justify-center mt-9 opacity-30 text-white">
                        <ArrowRight size={18} />
                    </div>

                    <div> 
                        <label className="block text-xs font-mono text-iron-dust mb-2">
                            {isDebtPayment ? 'Debt Account' : 'Account To'}
                        </label>
                        <select 
                            value={accountToId}
                            onChange={e => setAccountToId(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        >
                            <option value="">Select Destination...</option>
                            {isDebtPayment ? (
                                <optgroup label="Liabilities">
                                    {data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </optgroup>
                            ) : (
                                <optgroup label="Assets">
                                    {data.assets.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                            <input 
                                type="number" 
                                placeholder="0.00"
                                step="any"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">
                            {isDebtPayment ? 'Category' : 'Reference'}
                        </label>
                        <input 
                            type="text"
                            placeholder={isDebtPayment ? "e.g. Debt Payment" : "e.g. Savings Goal"}
                            value={isDebtPayment ? category : merchant} // Use merchant state for Reference in Transfer
                            onChange={e => isDebtPayment ? setCategory(e.target.value) : setMerchant(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        />
                    </div>
                </div>
              </>
          )}

          {/* === EXPENSE / INCOME LAYOUT === */}
          {!isInvesting && !isTransfer && !isDebtPayment && (
             <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">
                             {type === 'income' ? 'Payer / Source' : 'Merchant'}
                        </label>
                        <input 
                            list="merchants-list"
                            type="text" 
                            placeholder={type === 'income' ? "e.g. Employer" : "e.g. Starbucks"}
                            value={merchant}
                            onChange={e => setMerchant(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" 
                        />
                        <datalist id="merchants-list">
                            {uniqueMerchants.map((m, i) => <option key={i} value={m} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-mono text-iron-dust mb-2">Category</label>
                        <input 
                            list="categories-list"
                            type="text"
                            placeholder="e.g. Food"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                        />
                        <datalist id="categories-list">
                            {uniqueCategories.map((c, i) => <option key={i} value={c} />)}
                        </datalist>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-mono text-iron-dust mb-2">Amount</label>
                    <div className="relative">
                        <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                        <input 
                            type="number" 
                            placeholder="0.00"
                            step="any"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-mono text-iron-dust mb-2">Account</label>
                    <select 
                        value={accountId}
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                    >
                        <option value="">Select Account...</option>
                        <optgroup label="Assets">
                            {data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </optgroup>
                        <optgroup label="Debts">
                            {data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </optgroup>
                    </select>
                </div>
             </>
          )}

          {/* ESTIMATED TOTAL (Visible for Investing only) */}
          {isInvesting && (
             <div className="bg-white/5 p-4 rounded-sm border border-white/10 flex justify-between items-center">
                <div>
                    <span className="text-xs font-mono text-iron-dust uppercase tracking-wider block">Estimated Cost (GBP)</span>
                    {investCurrency === 'USD' && shares && pricePerShare && (
                        <span className="text-[10px] font-mono text-iron-dust mt-0.5 block">
                            ${nativeTotal.toFixed(2)} USD \u00f7 {gbpUsdRate.toFixed(4)} = {currencySymbol}{(nativeTotal / gbpUsdRate).toFixed(2)}
                        </span>
                    )}
                    {isGbxInvest && shares && pricePerShare && (
                        <span className="text-[10px] font-mono text-iron-dust mt-0.5 block">
                            {nativeTotal.toFixed(0)}p \u00f7 100 = {currencySymbol}{(nativeTotal / 100).toFixed(2)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                     <Calculator size={14} className="text-magma" />
                     {/* Amount is always in GBP */}
                     <span className="text-xl font-bold text-white font-mono">{currencySymbol}{amount || '0.00'}</span>
                </div>
            </div>
          )}

        </div>

        <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-end gap-3 sticky bottom-0 z-10">
          <button onClick={onClose} className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">Save Transaction</button>
        </div>
      </div>
    </div>
  );
};
