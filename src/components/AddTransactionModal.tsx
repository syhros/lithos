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

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountToId, setAccountToId] = useState('');

  // Investing
  const [ticker, setTicker] = useState('');
  const [assetName, setAssetName] = useState('');
  const [shares, setShares] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [assetType, setAssetType] = useState('Stock');
  const [investCategory, setInvestCategory] = useState('Buy');
  const [investCurrency, setInvestCurrency] = useState<Currency>('GBP');

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const uniqueCategories = useMemo(() => Array.from(new Set(data.transactions.map(t => t.category))).sort(), [data.transactions]);
  const uniqueMerchants  = useMemo(() => Array.from(new Set(data.transactions.filter(t => t.type !== 'investing').map(t => t.description))).sort(), [data.transactions]);

  const tickerMap = useMemo(() => {
    const map: Record<string, string> = {};
    data.transactions.forEach(t => { if (t.type === 'investing' && t.symbol && t.description) map[t.symbol.toUpperCase()] = t.description; });
    return map;
  }, [data.transactions]);

  useEffect(() => {
    if (type === 'investing' && ticker.toUpperCase() in tickerMap) setAssetName(tickerMap[ticker.toUpperCase()]);
  }, [ticker, type, tickerMap]);

  useEffect(() => {
    if (type === 'investing') {
      const s = parseFloat(shares) || 0;
      const p = parseFloat(pricePerShare) || 0;
      if (s > 0 && p >= 0) {
        let gbpTotal = s * p;
        if (investCurrency === 'USD' && gbpUsdRate > 0) gbpTotal = gbpTotal / gbpUsdRate;
        else if (investCurrency === 'GBX') gbpTotal = gbpTotal / 100;
        setAmount(gbpTotal.toFixed(2));
      }
    }
  }, [shares, pricePerShare, type, investCurrency, gbpUsdRate]);

  const resetForm = () => {
    setMerchant(''); setCategory(''); setAmount(''); setAccountId(''); setAccountToId('');
    setTicker(''); setAssetName(''); setShares(''); setPricePerShare('');
    setAssetType('Stock'); setInvestCategory('Buy'); setInvestCurrency('GBP');
    setType('expense');
    setDate(new Date().toISOString().split('T')[0]);
    setTime(new Date().toTimeString().slice(0, 5));
  };

  useEffect(() => {
    if (type === 'debt_payment') setCategory('Debt Payment');
    else if (type === 'transfer') setCategory('Transfer');
    else if (type !== 'investing') setCategory('');
  }, [type]);

  useEffect(() => {
    if (!editTransaction || !isOpen) { if (!editTransaction) resetForm(); return; }

    const tx = editTransaction;
    setType(tx.type);
    const [datePart, timePart] = tx.date.split('T');
    setDate(datePart);
    setTime(timePart?.substring(0, 5) || '00:00');
    setAmount(Math.abs(tx.amount).toFixed(2));
    setAccountId(tx.accountId || '');

    if (tx.type === 'investing') {
      setTicker(tx.symbol || '');
      setAssetName(tx.description);
      setShares(Math.abs(tx.quantity || 0).toString());
      setPricePerShare((tx.price || 0).toString());
      setInvestCategory(tx.category || 'Buy');
      setAssetType('Stock');
      setInvestCurrency(tx.currency || 'GBP');
    } else if (tx.type === 'transfer') {
      const paired = data.transactions.find(t =>
        t.type === 'transfer' &&
        t.id !== tx.id &&
        t.amount > 0 &&
        Math.abs(Math.abs(t.amount) - Math.abs(tx.amount)) < 0.01 &&
        Math.abs(new Date(t.date).getTime() - new Date(tx.date).getTime()) < 5000
      );
      setAccountToId(paired?.accountId || '');
      setMerchant(tx.description || '');
    } else if (tx.type === 'debt_payment') {
      const debtIds = new Set(data.debts.map(d => d.id));
      const isDebtSide = debtIds.has(tx.accountId || '');
      if (isDebtSide) {
        setAccountToId(tx.accountId || '');
        const paired = data.transactions.find(t =>
          t.type === 'debt_payment' &&
          t.id !== tx.id &&
          !debtIds.has(t.accountId || '') &&
          Math.abs(Math.abs(t.amount) - Math.abs(tx.amount)) < 0.01 &&
          Math.abs(new Date(t.date).getTime() - new Date(tx.date).getTime()) < 5000
        );
        setAccountId(paired?.accountId || '');
      } else {
        setAccountId(tx.accountId || '');
        const paired = data.transactions.find(t =>
          t.type === 'debt_payment' &&
          t.id !== tx.id &&
          debtIds.has(t.accountId || '') &&
          Math.abs(Math.abs(t.amount) - Math.abs(tx.amount)) < 0.01 &&
          Math.abs(new Date(t.date).getTime() - new Date(tx.date).getTime()) < 5000
        );
        setAccountToId(paired?.accountId || '');
      }
      setCategory(tx.category || 'Debt Payment');
    } else {
      setMerchant(tx.description || '');
      setCategory(tx.category || '');
    }
  }, [editTransaction, isOpen]);

  if (!isOpen) return null;

  const getAccountName = (id: string) => {
    return data.assets.find(x => x.id === id)?.name ||
           data.debts.find(x => x.id === id)?.name ||
           'Unknown Account';
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
    const debtIds = new Set(data.debts.map(d => d.id));

    // ── EDIT PATH ──────────────────────────────────────────────────
    if (editTransaction) {
      if (editTransaction.type === 'transfer') {
        const outflowTx = editTransaction;
        const paired = data.transactions.find(t =>
          t.type === 'transfer' && t.id !== outflowTx.id &&
          Math.abs(new Date(t.date).getTime() - new Date(outflowTx.date).getTime()) < 5000
        );
        await updateTransaction(outflowTx.id, { date: fullDate, description: merchant || `Transfer to ${getAccountName(accountToId)}`, amount: -Math.abs(amountNum), category: 'Transfer', accountId });
        if (paired) await updateTransaction(paired.id, { date: fullDate, description: merchant || `Transfer from ${getAccountName(accountId)}`, amount: Math.abs(amountNum), category: 'Transfer', accountId: accountToId });

      } else if (editTransaction.type === 'debt_payment') {
        const isDebtSide = debtIds.has(editTransaction.accountId || '');
        const sourceId = isDebtSide ? accountId : editTransaction.accountId!;
        const debtId   = isDebtSide ? editTransaction.accountId! : accountToId;
        const paired = data.transactions.find(t =>
          t.type === 'debt_payment' && t.id !== editTransaction.id &&
          Math.abs(new Date(t.date).getTime() - new Date(editTransaction.date).getTime()) < 5000
        );
        await updateTransaction(editTransaction.id, { date: fullDate, description: isDebtSide ? `Payment from ${getAccountName(sourceId)}` : `Payment to ${getAccountName(debtId)}`, amount: -Math.abs(amountNum), category: category || 'Debt Payment', accountId: editTransaction.accountId! });
        if (paired) await updateTransaction(paired.id, { date: fullDate, description: isDebtSide ? `Payment to ${getAccountName(debtId)}` : `Payment from ${getAccountName(sourceId)}`, amount: -Math.abs(amountNum), category: category || 'Debt Payment', accountId: paired.accountId! });

      } else if (editTransaction.type === 'investing') {
        // Fee: stored as negative amount (cost/loss)
        const isFee = investCategory === 'Fee';
        const savedAmount = isFee ? -Math.abs(amountNum) : amountNum;
        await updateTransaction(editTransaction.id, { date: fullDate, description: assetName, amount: savedAmount, category: investCategory, accountId, symbol: ticker.toUpperCase(), quantity: parseFloat(shares), price: parseFloat(pricePerShare), currency: investCurrency });

      } else {
        const isDebtAccount = debtIds.has(accountId);
        let finalAmount: number;
        if (isDebtAccount) {
          finalAmount = editTransaction.type === 'income' ? -Math.abs(amountNum) : Math.abs(amountNum);
        } else {
          finalAmount = editTransaction.type === 'expense' ? -Math.abs(amountNum) : Math.abs(amountNum);
        }
        await updateTransaction(editTransaction.id, { date: fullDate, description: merchant, amount: finalAmount, category, accountId });
      }
      resetForm(); onClose(); return;
    }

    // ── CREATE PATH ────────────────────────────────────────────────
    if (type === 'transfer') {
      addTransaction({ date: fullDate, description: merchant || `Transfer to ${getAccountName(accountToId)}`, amount: -Math.abs(amountNum), type: 'transfer', category: 'Transfer', accountId });
      addTransaction({ date: fullDate, description: merchant || `Transfer from ${getAccountName(accountId)}`, amount: Math.abs(amountNum), type: 'transfer', category: 'Transfer', accountId: accountToId });

    } else if (type === 'debt_payment') {
      addTransaction({ date: fullDate, description: `Payment to ${getAccountName(accountToId)}`, amount: -Math.abs(amountNum), type: 'debt_payment', category: category || 'Debt Payment', accountId });
      addTransaction({ date: fullDate, description: `Payment from ${getAccountName(accountId)}`, amount: -Math.abs(amountNum), type: 'debt_payment', category: category || 'Debt Payment', accountId: accountToId });

    } else if (type === 'investing') {
      // Fee transactions: stored as negative amount so P/L treats them as a cost/loss
      // Shares are still subtracted from total holdings (the fund sells shares to pay the fee)
      const isFee = investCategory === 'Fee';
      const savedAmount = isFee ? -Math.abs(amountNum) : amountNum;
      addTransaction({ date: fullDate, description: assetName, amount: savedAmount, type: 'investing', category: investCategory, accountId, symbol: ticker.toUpperCase(), quantity: parseFloat(shares), price: parseFloat(pricePerShare), currency: investCurrency });

    } else {
      const isDebtAccount = debtIds.has(accountId);
      let finalAmount: number;
      if (isDebtAccount) {
        finalAmount = type === 'income' ? -Math.abs(amountNum) : Math.abs(amountNum);
      } else {
        finalAmount = type === 'expense' ? -Math.abs(amountNum) : Math.abs(amountNum);
      }
      addTransaction({ date: fullDate, description: merchant, amount: finalAmount, type, category: category || 'General', accountId });
    }

    resetForm(); onClose();
  };

  const isInvesting   = type === 'investing';
  const isTransfer    = type === 'transfer';
  const isDebtPayment = type === 'debt_payment';
  const isFeeCategory = isInvesting && investCategory === 'Fee';
  const priceSymbol   = investCurrency === 'USD' ? '$' : investCurrency === 'EUR' ? '\u20ac' : investCurrency === 'GBX' ? 'p' : '\u00a3';
  const nativeTotal   = (parseFloat(shares) || 0) * (parseFloat(pricePerShare) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-xl p-0 shadow-2xl rounded-sm max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] sticky top-0 z-10">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">
            {editTransaction ? 'Edit Transaction' : isInvesting ? 'Add Investment' : isTransfer ? 'Transfer Funds' : isDebtPayment ? 'Record Payment' : 'Add Transaction'}
          </h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-6">
          {validationErrors.length > 0 && (
            <div className="bg-magma/10 border border-magma/50 rounded-sm p-3">
              <ul className="text-xs text-magma space-y-1">{validationErrors.map((e, i) => <li key={i}>\u2022 {e}</li>)}</ul>
            </div>
          )}

          {/* Row 1: Type / Date / Time */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs font-mono text-iron-dust mb-2">Type</label>
              <select value={type} onChange={e => { setType(e.target.value as TransactionType); setAccountId(''); setAccountToId(''); }} disabled={!!editTransaction} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
                <option value="debt_payment">Debt Payment</option>
                <option value="investing">Investing</option>
              </select>
            </div>
            <div className="col-span-7 md:col-span-5">
              <label className="block text-xs font-mono text-iron-dust mb-2">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
            </div>
            <div className="col-span-5 md:col-span-3">
              <label className="block text-xs font-mono text-iron-dust mb-2">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
            </div>
          </div>

          <hr className="border-white/5" />

          {/* INVESTING */}
          {isInvesting && (
            <>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Ticker</label>
                  <input type="text" placeholder="AAPL" value={ticker} onChange={e => setTicker(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono uppercase" />
                </div>
                <div className="col-span-8">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Asset Name</label>
                  <input type="text" placeholder="e.g. Apple Inc." value={assetName} onChange={e => setAssetName(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6 md:col-span-3">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Shares</label>
                  <input type="number" placeholder="0.00000000" step="any" value={shares} onChange={e => setShares(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Currency</label>
                  <select value={investCurrency} onChange={e => setInvestCurrency(e.target.value as Currency)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                    <option value="GBP">GBP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBX">GBX</option>
                  </select>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Price / Share</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-iron-dust text-xs">{priceSymbol}</span>
                    <input type="number" placeholder="0.00" step="any" value={pricePerShare} onChange={e => setPricePerShare(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-3">
                  <label className="block text-xs font-mono text-iron-dust mb-2">Asset Type</label>
                  <select value={assetType} onChange={e => setAssetType(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                    <option>Stock</option><option>Crypto</option><option>ETF</option><option>Pension</option><option>REIT</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-[1.2fr_1fr] gap-4">
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">Investing Account</label>
                  <select value={accountId} onChange={e => setAccountId(e.target.value)} className={clsx('w-full bg-black/20 border p-3 text-sm text-white rounded-sm focus:outline-none', validationErrors.some(e => e.includes('account')) ? 'border-magma/50 focus:border-magma' : 'border-white/10 focus:border-magma')}>
                    <option value="">Select Account...</option>
                    <optgroup label="Investment Accounts">{data.assets.filter(a => a.type === 'investment').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">Category</label>
                  <div className="flex gap-1.5 h-[42px]">
                    {['Buy', 'Sell', 'Dividend', 'Fee'].map(cat => (
                      <button key={cat} type="button" onClick={() => setInvestCategory(cat)} className={clsx(
                        'flex-1 px-2 py-2 text-xs font-mono font-bold uppercase rounded-sm transition-colors',
                        investCategory === cat
                          ? cat === 'Fee'
                            ? 'bg-amber-500 text-white border border-amber-500'
                            : 'bg-magma text-white border border-magma'
                          : 'bg-white/5 text-iron-dust border border-white/10 hover:border-white/20'
                      )}>{cat}</button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Fee info banner */}
              {isFeeCategory && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-sm p-3 text-xs font-mono text-amber-400">
                  <span className="font-bold uppercase tracking-wider block mb-1">Management Fee</span>
                  Shares will be subtracted from your holding. The cost will be recorded as a <span className="text-white font-bold">loss</span> in P&amp;L — not a gain.
                </div>
              )}
            </>
          )}

          {/* TRANSFER & DEBT PAYMENT */}
          {(isTransfer || isDebtPayment) && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">Account From</label>
                  <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                    <option value="">Select Source...</option>
                    <optgroup label="Liquid Assets">{data.assets.filter(a => a.type !== 'investment').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                  </select>
                </div>
                <div className="flex justify-center mt-9 opacity-30 text-white"><ArrowRight size={18} /></div>
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">{isDebtPayment ? 'Debt Account' : 'Account To'}</label>
                  <select value={accountToId} onChange={e => setAccountToId(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                    <option value="">Select Destination...</option>
                    {isDebtPayment
                      ? <optgroup label="Liabilities">{data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                      : <optgroup label="Assets">{data.assets.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                    }
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                    <input type="number" placeholder="0.00" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">{isDebtPayment ? 'Category' : 'Reference'}</label>
                  <input type="text" placeholder={isDebtPayment ? 'e.g. Debt Payment' : 'e.g. Savings Goal'} value={isDebtPayment ? category : merchant} onChange={e => isDebtPayment ? setCategory(e.target.value) : setMerchant(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                </div>
              </div>
            </>
          )}

          {/* EXPENSE / INCOME */}
          {!isInvesting && !isTransfer && !isDebtPayment && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">{type === 'income' ? 'Payer / Source' : 'Merchant'}</label>
                  <input list="merchants-list" type="text" placeholder={type === 'income' ? 'e.g. Employer' : 'e.g. Starbucks'} value={merchant} onChange={e => setMerchant(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                  <datalist id="merchants-list">{uniqueMerchants.map((m,i) => <option key={i} value={m} />)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-mono text-iron-dust mb-2">Category</label>
                  <input list="categories-list" type="text" placeholder="e.g. Food" value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" />
                  <datalist id="categories-list">{uniqueCategories.map((c,i) => <option key={i} value={c} />)}</datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-iron-dust mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                  <input type="number" placeholder="0.00" step="any" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-iron-dust mb-2">Account</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
                  <option value="">Select Account...</option>
                  <optgroup label="Assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
                  <optgroup label="Debts">{data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                </select>
              </div>
            </>
          )}

          {/* Investing estimated total */}
          {isInvesting && (
            <div className={clsx(
              'p-4 rounded-sm border flex justify-between items-center',
              isFeeCategory
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-white/5 border-white/10'
            )}>
              <div>
                <span className="text-xs font-mono text-iron-dust uppercase tracking-wider block">
                  {isFeeCategory ? 'Fee Cost (GBP) — recorded as loss' : 'Estimated Cost (GBP)'}
                </span>
                {investCurrency === 'USD' && shares && pricePerShare && <span className="text-[10px] font-mono text-iron-dust mt-0.5 block">${nativeTotal.toFixed(2)} USD \u00f7 {gbpUsdRate.toFixed(4)} = {currencySymbol}{(nativeTotal / gbpUsdRate).toFixed(2)}</span>}
                {investCurrency === 'GBX' && shares && pricePerShare && <span className="text-[10px] font-mono text-iron-dust mt-0.5 block">{nativeTotal.toFixed(0)}p \u00f7 100 = {currencySymbol}{(nativeTotal / 100).toFixed(2)}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Calculator size={14} className={isFeeCategory ? 'text-amber-500' : 'text-magma'} />
                <span className={clsx('text-xl font-bold font-mono', isFeeCategory ? 'text-amber-400' : 'text-white')}>
                  {isFeeCategory ? '-' : ''}{currencySymbol}{amount || '0.00'}
                </span>
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
