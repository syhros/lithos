import React, { useState, useRef, useCallback, useMemo } from 'react';
import { X, Upload, FileText, Download, AlertTriangle, CheckCircle, ChevronDown, TrendingUp, TrendingDown, Layers, Activity } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { TransactionType, Currency } from '../data/mockData';
import { clsx } from 'clsx';

type ImportMode = 'accounts' | 'investments';
type Step = 'upload' | 'map' | 'confirm' | 'done';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

const ACCOUNT_FIELDS: FieldDef[] = [
  { key: 'type',        label: 'Type',     required: true,  description: 'income, expense, transfer...' },
  { key: 'date',        label: 'Date',     required: true,  description: '2024-01-15 or 15/01/2024' },
  { key: 'amount',      label: 'Amount',   required: false, description: 'Single amount column' },
  { key: 'debit',       label: 'Debit',    required: false, description: 'Debit / expense column' },
  { key: 'credit',      label: 'Credit',   required: false, description: 'Credit / income column' },
  { key: 'description', label: 'Merchant', required: false, description: 'Payee / merchant name' },
  { key: 'category',    label: 'Category', required: false, description: 'e.g. Groceries' },
  { key: 'time',        label: 'Time',     required: false, description: 'HH:MM (optional)' },
  { key: 'accountId',   label: 'Account',  required: false, description: 'Account name per row' },
];

const INVESTMENT_FIELDS: FieldDef[] = [
  { key: 'symbol',      label: 'Ticker',      required: true,  description: 'e.g. AAPL, TSLA' },
  { key: 'date',        label: 'Date',         required: true,  description: '2024-01-15' },
  { key: 'quantity',    label: 'Shares / Qty', required: true,  description: 'Number of units' },
  { key: 'price',       label: 'Price / Unit', required: true,  description: 'Price in native currency' },
  { key: 'currency',    label: 'Currency',     required: false, description: 'GBP, USD, EUR' },
  { key: 'description', label: 'Asset Name',   required: false, description: 'e.g. Apple Inc.' },
  { key: 'category',    label: 'Asset Type',   required: false, description: 'Stock, ETF, Crypto...' },
  { key: 'time',        label: 'Time',         required: false, description: 'HH:MM (optional)' },
];

const USD_TO_GBP = 0.74;

// ── CSV helpers ──────────────────────────────────────────────────────────────

const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  return { headers: parseRow(lines[0]), rows: lines.slice(1).filter(l => l.trim()).map(parseRow) };
};

const parseDate = (raw: string, time?: string): string => {
  if (!raw) return new Date().toISOString();
  const c = raw.trim();
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}/.test(c)) date = new Date(c.slice(0, 10));
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(c)) { const [d, m, y] = c.split('/'); date = new Date(`${y}-${m}-${d}`); }
  else { const p = c.split('/'); date = new Date(`${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`); }
  if (isNaN(date.getTime())) date = new Date(c);
  if (isNaN(date.getTime())) date = new Date();
  return new Date(`${date.toISOString().split('T')[0]}T${time?.trim() || '12:00'}:00`).toISOString();
};

const cleanNum = (s: string) => parseFloat(s.replace(/[£$€,\s]/g, ''));

const AUTO_MAPPING: Record<string, string[]> = {
  date:        ['date', 'transaction date', 'trans date', 'posted date', 'value date'],
  amount:      ['amount', 'value', 'transaction amount'],
  debit:       ['debit', 'debit amount', 'withdrawals', 'withdrawal', 'out'],
  credit:      ['credit', 'credit amount', 'deposits', 'deposit', 'in'],
  description: ['description', 'merchant', 'payee', 'reference', 'narrative', 'details', 'memo'],
  category:    ['category'],
  type:        ['type', 'transaction type', 'trans type'],
  time:        ['time', 'transaction time'],
  accountId:   ['account', 'account name', 'account id'],
  symbol:      ['ticker', 'symbol', 'stock', 'isin'],
  quantity:    ['quantity', 'qty', 'shares', 'units'],
  price:       ['price', 'price per share', 'unit price', 'nav'],
  currency:    ['currency', 'ccy'],
};

const autoDetect = (headers: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach(h => {
    const lower = h.toLowerCase().trim();
    Object.entries(AUTO_MAPPING).forEach(([field, aliases]) => {
      if (!result[field] && aliases.includes(lower)) result[field] = h;
    });
  });
  return result;
};

const downloadTemplate = (mode: ImportMode) => {
  let csv = '';
  if (mode === 'accounts') {
    csv = 'type,date,debit amount,credit amount,description,category,time,account\n';
    csv += 'expense,2024-01-15,45.50,,Waitrose,Groceries,09:30,Monzo Current\n';
    csv += 'income,2024-01-01,,4200.00,Tech Solutions Ltd,Salary,08:00,Monzo Current\n';
    csv += 'debt_payment,2024-01-20,150.00,,Amex Payment,Payment,12:00,Monzo Current\n';
  } else {
    csv = 'ticker,date,quantity,price,currency,description,category,time\n';
    csv += 'AAPL,2024-01-15,10,178.35,USD,Apple Inc.,Stock,14:30\n';
    csv += 'VUSA.L,2024-01-16,5,62.50,GBP,Vanguard S&P 500,ETF,10:00\n';
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = mode === 'accounts' ? 'lithos_accounts_template.csv' : 'lithos_investments_template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// ── Mapping row select ────────────────────────────────────────────────────────

const MappingSelect: React.FC<{
  field: FieldDef;
  mapping: Record<string, string>;
  headers: string[];
  onChange: (key: string, val: string) => void;
}> = ({ field, mapping, headers, onChange }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="flex items-center gap-1.5 w-[90px] flex-shrink-0">
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', field.required ? 'bg-magma' : 'bg-white/20')} />
      <span className="text-[11px] text-white whitespace-nowrap truncate">{field.label}</span>
      {field.required && <span className="text-magma text-[10px]">*</span>}
    </div>
    <div className="relative flex-1 min-w-0">
      <select
        value={mapping[field.key] || ''}
        onChange={e => onChange(field.key, e.target.value)}
        className={clsx(
          'w-full bg-black/30 border p-2 pr-7 text-xs rounded-sm focus:outline-none appearance-none transition-colors truncate',
          mapping[field.key]
            ? 'border-emerald-vein/40 text-white focus:border-emerald-vein'
            : field.required
              ? 'border-white/10 text-iron-dust focus:border-magma'
              : 'border-white/5 text-iron-dust/60 focus:border-white/20'
        )}
      >
        <option value="">— not mapped —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-iron-dust pointer-events-none" />
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const CSVImportModal: React.FC<CSVImportModalProps> = ({ isOpen, onClose }) => {
  const { data, addTransaction, currencySymbol } = useFinance();

  const [mode, setMode] = useState<ImportMode>('accounts');
  const [step, setStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importCount, setImportCount] = useState(0);
  const [importStats, setImportStats] = useState({ income: 0, expense: 0, netChange: 0, investments: 0 });

  const fileRef = useRef<HTMLInputElement>(null);

  const activeFields = mode === 'accounts' ? ACCOUNT_FIELDS : INVESTMENT_FIELDS;

  const allAccounts = useMemo(() => [
    ...data.assets.map(a => ({ id: a.id, name: a.name, group: a.type === 'investment' ? 'Investment' : 'Asset' })),
    ...data.debts.map(d => ({ id: d.id, name: d.name, group: 'Debt' })),
  ], [data]);

  const investmentAccounts = useMemo(() => data.assets.filter(a => a.type === 'investment'), [data.assets]);

  const reset = () => {
    setStep('upload'); setFileName(''); setCsvHeaders([]); setCsvRows([]);
    setMapping({}); setSelectedAccountId(''); setErrors([]);
    setImportCount(0); setImportStats({ income: 0, expense: 0, netChange: 0, investments: 0 });
    setIsDragging(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const setMappingField = useCallback((key: string, val: string) => {
    setMapping(prev => ({ ...prev, [key]: val }));
  }, []);

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { setErrors(['Only .csv files are supported.']); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (!headers.length) { setErrors(['Could not parse CSV — ensure a header row exists.']); return; }
      setCsvHeaders(headers); setCsvRows(rows); setFileName(file.name);
      setMapping(autoDetect(headers)); setErrors([]); setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const getCellValue = (row: string[], key: string) => {
    const h = mapping[key];
    if (!h) return '';
    const idx = csvHeaders.indexOf(h);
    return idx >= 0 ? (row[idx] || '') : '';
  };

  // Resolve amount from either single or dual columns
  const resolveAmount = (row: string[], type: TransactionType): number => {
    const hasDebit = !!mapping['debit'];
    const hasCredit = !!mapping['credit'];
    const hasSingle = !!mapping['amount'];

    if (hasDebit || hasCredit) {
      const debitRaw = getCellValue(row, 'debit');
      const creditRaw = getCellValue(row, 'credit');
      const debitVal = cleanNum(debitRaw);
      const creditVal = cleanNum(creditRaw);
      const debit = !isNaN(debitVal) && debitVal !== 0 ? debitVal : 0;
      const credit = !isNaN(creditVal) && creditVal !== 0 ? creditVal : 0;
      if (credit > 0) return credit;
      if (debit > 0) return -Math.abs(debit);
      return 0;
    }

    if (hasSingle) {
      const raw = cleanNum(getCellValue(row, 'amount'));
      return isNaN(raw) ? 0 : raw;
    }
    return 0;
  };

  const normalizeType = (raw: string): TransactionType => {
    const lower = raw.toLowerCase().trim();
    if (['income', 'credit', 'deposit'].includes(lower)) return 'income';
    if (['expense', 'debit', 'purchase', 'withdrawal'].includes(lower)) return 'expense';
    if (['debt_payment', 'payment'].includes(lower)) return 'debt_payment';
    if (['transfer'].includes(lower)) return 'transfer';
    if (['invest', 'investing', 'buy', 'sell'].includes(lower)) return 'investing';
    return 'expense';
  };

  const resolveAccountId = (row: string[]): string => {
    if (selectedAccountId) return selectedAccountId;
    const nameVal = getCellValue(row, 'accountId').trim().toLowerCase();
    return allAccounts.find(a => a.name.toLowerCase() === nameVal)?.id || '';
  };

  const validateMapping = (): string[] => {
    const errs: string[] = [];
    if (mode === 'accounts') {
      if (!mapping['date']) errs.push('Required field "Date" is not mapped.');
      if (!mapping['type']) errs.push('Required field "Type" is not mapped.');
      const hasAmount = mapping['amount'] || mapping['debit'] || mapping['credit'];
      if (!hasAmount) errs.push('Map at least one amount column (Amount, Debit, or Credit).');
      if (!selectedAccountId && !mapping['accountId']) errs.push('Select an account or map the Account column.');
    } else {
      ['symbol', 'date', 'quantity', 'price'].forEach(k => {
        if (!mapping[k]) errs.push(`Required field "${INVESTMENT_FIELDS.find(f => f.key === k)?.label}" is not mapped.`);
      });
      if (!selectedAccountId) errs.push('Select an investment account.');
    }
    return errs;
  };

  // Build preview stats from all rows
  const previewStats = useMemo(() => {
    if (!csvRows.length || step !== 'map') return null;
    let income = 0, expense = 0, investments = 0, valid = 0;
    csvRows.forEach(row => {
      if (mode === 'accounts') {
        const rawType = getCellValue(row, 'type');
        const type = normalizeType(rawType);
        const amount = resolveAmount(row, type);
        if (amount === 0 && !mapping['amount'] && !mapping['debit'] && !mapping['credit']) return;
        if (amount > 0) income += amount;
        else expense += Math.abs(amount);
        valid++;
      } else {
        const rawQty = cleanNum(getCellValue(row, 'quantity'));
        const rawPrice = cleanNum(getCellValue(row, 'price'));
        if (!isNaN(rawQty) && !isNaN(rawPrice)) {
          investments += rawQty * rawPrice;
          valid++;
        }
      }
    });
    return { income, expense, netChange: income - expense, investments, valid };
  }, [csvRows, mapping, mode, step]);

  const doImport = () => {
    const errs = validateMapping();
    if (errs.length) { setErrors(errs); return; }

    let count = 0;
    const newErrors: string[] = [];
    let totalIncome = 0, totalExpense = 0, totalInvestments = 0;

    csvRows.forEach((row, i) => {
      try {
        if (mode === 'accounts') {
          const rawType = getCellValue(row, 'type');
          const type = normalizeType(rawType);
          const amount = resolveAmount(row, type);
          const description = getCellValue(row, 'description') || 'Imported Transaction';
          const category = getCellValue(row, 'category') || 'General';
          const time = getCellValue(row, 'time') || '12:00';
          const accountId = resolveAccountId(row);
          const rawDate = getCellValue(row, 'date');

          if (!accountId) { newErrors.push(`Row ${i + 2}: Could not resolve account.`); return; }
          if (amount === 0 && !getCellValue(row, 'amount') && !getCellValue(row, 'debit') && !getCellValue(row, 'credit')) {
            newErrors.push(`Row ${i + 2}: Invalid or zero amount.`); return;
          }

          addTransaction({ date: parseDate(rawDate, time), description, amount, type, category, accountId });
          if (amount > 0) totalIncome += amount; else totalExpense += Math.abs(amount);
          count++;
        } else {
          const symbol = getCellValue(row, 'symbol').toUpperCase();
          const rawDate = getCellValue(row, 'date');
          const qty = cleanNum(getCellValue(row, 'quantity'));
          const price = cleanNum(getCellValue(row, 'price'));
          const rawCurrency = getCellValue(row, 'currency').toUpperCase() || 'GBP';
          const description = getCellValue(row, 'description') || symbol;
          const category = getCellValue(row, 'category') || 'Stock';
          const time = getCellValue(row, 'time') || '12:00';

          if (!symbol) { newErrors.push(`Row ${i + 2}: Missing ticker.`); return; }
          if (isNaN(qty) || isNaN(price)) { newErrors.push(`Row ${i + 2}: Invalid quantity or price.`); return; }

          const validCurrency: Currency = (['GBP', 'USD', 'EUR'] as const).includes(rawCurrency as Currency)
            ? rawCurrency as Currency : 'GBP';
          const gbpAmount = validCurrency === 'USD' ? qty * price * USD_TO_GBP : qty * price;
          totalInvestments += gbpAmount;

          addTransaction({
            date: parseDate(rawDate, time), description, amount: gbpAmount,
            type: 'investing', category, accountId: selectedAccountId,
            symbol, quantity: qty, price, currency: validCurrency,
          });
          count++;
        }
      } catch { newErrors.push(`Row ${i + 2}: Unexpected error.`); }
    });

    setImportCount(count);
    setImportStats({ income: totalIncome, expense: totalExpense, netChange: totalIncome - totalExpense, investments: totalInvestments });
    setErrors(newErrors);
    setStep('done');
  };

  if (!isOpen) return null;

  const previewRows = csvRows.slice(0, 10);
  const mappedFields = activeFields.filter(f => mapping[f.key]);

  const fmtCurrency = (n: number) => `${currencySymbol}${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: '1. Upload' },
    { key: 'map',    label: '2. Map Fields & Preview' },
    { key: 'confirm',label: '3. Confirm & Import' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-4xl rounded-sm shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Import CSV</h3>
            {step === 'upload' && (
              <div className="flex bg-black/30 border border-white/5 rounded-sm overflow-hidden">
                {(['accounts', 'investments'] as ImportMode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={clsx(
                      'px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all',
                      mode === m ? 'bg-magma text-black' : 'text-iron-dust hover:text-white'
                    )}>{m}</button>
                ))}
              </div>
            )}
            {step !== 'upload' && step !== 'done' && (
              <span className="text-[10px] font-mono text-iron-dust bg-white/5 px-2 py-1 rounded-sm">
                {mode === 'accounts' ? 'Accounts & Debts' : 'Investments'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'upload' && (
              <button onClick={() => downloadTemplate(mode)}
                className="flex items-center gap-2 px-3 py-1.5 border border-white/10 text-iron-dust text-[10px] font-mono uppercase tracking-wider rounded-sm hover:text-white hover:border-white/20 transition-colors">
                <Download size={12} /> Template
              </button>
            )}
            <button onClick={handleClose} className="text-iron-dust hover:text-white transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Step tabs */}
        {step !== 'done' && (
          <div className="flex border-b border-white/5 flex-shrink-0">
            {STEPS.map(s => (
              <div key={s.key} className={clsx(
                'flex-1 py-2.5 text-center text-[10px] font-mono uppercase tracking-[2px] transition-colors border-b-2',
                step === s.key ? 'text-white border-magma' : 'text-iron-dust border-transparent'
              )}>{s.label}</div>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ── STEP 1: Upload ────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="p-8">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-sm p-14 flex flex-col items-center justify-center cursor-pointer transition-all',
                  isDragging ? 'border-magma bg-magma/5' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
                )}
              >
                <Upload size={36} className={clsx('mb-4 transition-colors', isDragging ? 'text-magma' : 'text-iron-dust')} />
                <p className="text-white font-bold mb-1">Drop your CSV here</p>
                <p className="text-iron-dust text-xs font-mono">or click to browse</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>

              {errors.length > 0 && (
                <div className="mt-4 bg-magma/10 border border-magma/30 rounded-sm p-4">
                  {errors.map((e, i) => <p key={i} className="text-xs text-magma font-mono">{e}</p>)}
                </div>
              )}

              <div className="mt-5 bg-black/20 border border-white/5 rounded-sm p-5">
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">
                  {mode === 'accounts' ? 'Accounts & Debts' : 'Investment'} — Expected Fields
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {activeFields.map(f => (
                    <div key={f.key} className="flex items-start gap-2">
                      <span className={clsx('mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0', f.required ? 'bg-magma' : 'bg-iron-dust/40')} />
                      <div>
                        <span className="text-[11px] text-white font-mono">{f.label}</span>
                        {f.required && <span className="text-magma text-[10px] ml-1">*</span>}
                        <p className="text-[10px] text-iron-dust">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {mode === 'accounts' && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-iron-dust">
                      Tip: Use <span className="text-white font-mono">Debit</span> + <span className="text-white font-mono">Credit</span> columns if your bank exports separate columns for each direction.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: Map Fields & Preview ─────────────────────────────── */}
          {step === 'map' && (
            <div className="p-6 space-y-5">
              {/* File pill + account select */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-sm px-4 py-3">
                  <FileText size={14} className="text-iron-dust flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-mono truncate">{fileName}</p>
                    <p className="text-[10px] text-iron-dust">{csvRows.length} rows · {csvHeaders.length} cols</p>
                  </div>
                  <button onClick={reset} className="text-[10px] font-mono text-iron-dust uppercase hover:text-white transition-colors">Change</button>
                </div>

                <div className="relative">
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1.5">
                    {mode === 'accounts' ? 'Account (all rows — or use Account column)' : 'Investment Account *'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 py-2 px-3 pr-8 text-xs text-white rounded-sm focus:border-magma outline-none appearance-none"
                  >
                    <option value="">{mode === 'accounts' ? '— Use CSV Account column —' : 'Select account...'}</option>
                    {mode === 'accounts' ? (
                      <>
                        <optgroup label="Assets">
                          {data.assets.filter(a => a.type !== 'investment').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </optgroup>
                        <optgroup label="Debts">
                          {data.debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </optgroup>
                      </>
                    ) : (
                      <optgroup label="Investment Accounts">
                        {investmentAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 bottom-2.5 text-iron-dust pointer-events-none" />
                </div>
              </div>

              {/* 2-column mapping grid */}
              <div>
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Map CSV Columns to Fields</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {activeFields.map(field => (
                    <MappingSelect key={field.key} field={field} mapping={mapping} headers={csvHeaders} onChange={setMappingField} />
                  ))}
                </div>
                {mode === 'accounts' && (
                  <p className="text-[10px] text-iron-dust mt-2.5">
                    Map <span className="text-white font-mono">Debit</span> + <span className="text-white font-mono">Credit</span> <span className="italic">or</span> just <span className="text-white font-mono">Amount</span>.
                  </p>
                )}
              </div>

              {/* Live stats bar */}
              {previewStats && previewStats.valid > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {mode === 'accounts' ? (
                    <>
                      <div className="bg-black/20 border border-white/5 rounded-sm p-3">
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Rows</p>
                        <p className="text-lg font-bold text-white font-mono">{previewStats.valid}</p>
                      </div>
                      <div className="bg-black/20 border border-emerald-vein/20 rounded-sm p-3">
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Income</p>
                        <p className="text-lg font-bold text-emerald-vein font-mono">{fmtCurrency(previewStats.income)}</p>
                      </div>
                      <div className="bg-black/20 border border-magma/20 rounded-sm p-3">
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Expenses</p>
                        <p className="text-lg font-bold text-magma font-mono">{fmtCurrency(previewStats.expense)}</p>
                      </div>
                      <div className={clsx('bg-black/20 rounded-sm p-3 border', previewStats.netChange >= 0 ? 'border-emerald-vein/20' : 'border-magma/20')}>
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Net</p>
                        <p className={clsx('text-lg font-bold font-mono', previewStats.netChange >= 0 ? 'text-emerald-vein' : 'text-magma')}>
                          {previewStats.netChange < 0 ? '-' : '+'}{fmtCurrency(previewStats.netChange)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-black/20 border border-white/5 rounded-sm p-3">
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Rows</p>
                        <p className="text-lg font-bold text-white font-mono">{previewStats.valid}</p>
                      </div>
                      <div className="bg-black/20 border border-blue-400/20 rounded-sm p-3 col-span-3">
                        <p className="text-[10px] font-mono text-iron-dust uppercase mb-1">Total Invested (native)</p>
                        <p className="text-lg font-bold text-blue-400 font-mono">{fmtCurrency(previewStats.investments)}</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* CSV Preview table */}
              <div>
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                  Preview — first {Math.min(10, csvRows.length)} of {csvRows.length} rows
                </p>
                <div className="overflow-x-auto rounded-sm border border-white/5">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#131517]">
                      <tr>
                        <th className="py-2 px-3 text-[10px] font-mono text-iron-dust/60 border-b border-white/5 w-8">#</th>
                        {mappedFields.map(f => (
                          <th key={f.key} className="py-2 px-3 text-[10px] font-mono text-iron-dust uppercase tracking-wider border-b border-white/5 whitespace-nowrap">
                            {f.label} <span className="text-iron-dust/40 normal-case">← {mapping[f.key]}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {previewRows.map((row, i) => (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          <td className="py-2 px-3 text-iron-dust/40 font-mono text-[10px]">{i + 1}</td>
                          {mappedFields.map(f => {
                            const val = getCellValue(row, f.key);
                            const isAmt = ['amount', 'debit', 'credit', 'price'].includes(f.key);
                            const numVal = isAmt ? cleanNum(val) : NaN;
                            return (
                              <td key={f.key} className={clsx(
                                'py-2 px-3 font-mono max-w-[140px] truncate',
                                isAmt && !isNaN(numVal)
                                  ? (f.key === 'debit' ? 'text-magma' : f.key === 'credit' ? 'text-emerald-vein' : numVal >= 0 ? 'text-emerald-vein' : 'text-magma')
                                  : 'text-white/80'
                              )}>
                                {val || <span className="text-iron-dust/30">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvRows.length > 10 && (
                  <p className="text-[10px] text-iron-dust/50 font-mono text-center mt-2">
                    + {csvRows.length - 10} more rows not shown
                  </p>
                )}
              </div>

              {errors.length > 0 && (
                <div className="bg-magma/10 border border-magma/30 rounded-sm p-4 space-y-1.5">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={12} className="text-magma flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-magma font-mono">{e}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Confirm ──────────────────────────────────────────── */}
          {step === 'confirm' && (
            <div className="p-8 space-y-6">
              <div>
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1">Ready to import</p>
                <p className="text-xs text-iron-dust">
                  <span className="text-white font-mono">{csvRows.length} transactions</span> from{' '}
                  <span className="text-white font-mono">{fileName}</span>
                </p>
              </div>

              {/* Summary cards */}
              {mode === 'accounts' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 border border-white/5 rounded-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Layers size={14} className="text-iron-dust" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Transactions</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{csvRows.length}</p>
                  </div>
                  <div className="bg-black/20 border border-emerald-vein/20 rounded-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={14} className="text-emerald-vein" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Total Income</span>
                    </div>
                    <p className="text-3xl font-bold text-emerald-vein">
                      {previewStats ? fmtCurrency(previewStats.income) : '—'}
                    </p>
                  </div>
                  <div className="bg-black/20 border border-magma/20 rounded-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown size={14} className="text-magma" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Total Expenses</span>
                    </div>
                    <p className="text-3xl font-bold text-magma">
                      {previewStats ? fmtCurrency(previewStats.expense) : '—'}
                    </p>
                  </div>
                  <div className={clsx(
                    'bg-black/20 rounded-sm p-5 border',
                    previewStats && previewStats.netChange >= 0 ? 'border-emerald-vein/20' : 'border-magma/20'
                  )}>
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={14} className="text-iron-dust" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Net Account Change</span>
                    </div>
                    <p className={clsx(
                      'text-3xl font-bold',
                      previewStats && previewStats.netChange >= 0 ? 'text-emerald-vein' : 'text-magma'
                    )}>
                      {previewStats
                        ? `${previewStats.netChange >= 0 ? '+' : ''}${fmtCurrency(previewStats.netChange)}`
                        : '—'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 border border-white/5 rounded-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Layers size={14} className="text-iron-dust" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Transactions</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{csvRows.length}</p>
                  </div>
                  <div className="bg-black/20 border border-blue-400/20 rounded-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={14} className="text-blue-400" />
                      <span className="text-[10px] font-mono text-iron-dust uppercase tracking-wider">Total Invested</span>
                    </div>
                    <p className="text-3xl font-bold text-blue-400">
                      {previewStats ? fmtCurrency(previewStats.investments) : '—'}
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-amber-400/5 border border-amber-400/20 rounded-sm p-4">
                <p className="text-xs text-amber-400 font-mono">
                  This action will add {csvRows.length} transactions and cannot be undone in bulk.
                </p>
              </div>
            </div>
          )}

          {/* ── DONE ─────────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <CheckCircle size={48} className="text-emerald-vein mb-5" />
              <h3 className="text-2xl font-bold text-white mb-2">{importCount} transactions imported</h3>
              <p className="text-iron-dust text-sm font-mono mb-6">From <span className="text-white">{fileName}</span></p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full mb-6 text-left">
                {mode === 'accounts' ? (
                  <>
                    <div className="bg-black/20 border border-white/5 rounded-sm p-4">
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Imported</p>
                      <p className="text-xl font-bold text-white">{importCount}</p>
                    </div>
                    <div className="bg-black/20 border border-emerald-vein/20 rounded-sm p-4">
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Income</p>
                      <p className="text-xl font-bold text-emerald-vein">{fmtCurrency(importStats.income)}</p>
                    </div>
                    <div className="bg-black/20 border border-magma/20 rounded-sm p-4">
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Expenses</p>
                      <p className="text-xl font-bold text-magma">{fmtCurrency(importStats.expense)}</p>
                    </div>
                    <div className={clsx('bg-black/20 rounded-sm p-4 border', importStats.netChange >= 0 ? 'border-emerald-vein/20' : 'border-magma/20')}>
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Net Change</p>
                      <p className={clsx('text-xl font-bold', importStats.netChange >= 0 ? 'text-emerald-vein' : 'text-magma')}>
                        {importStats.netChange >= 0 ? '+' : ''}{fmtCurrency(importStats.netChange)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-black/20 border border-white/5 rounded-sm p-4">
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Imported</p>
                      <p className="text-xl font-bold text-white">{importCount}</p>
                    </div>
                    <div className="bg-black/20 border border-blue-400/20 rounded-sm p-4 col-span-3">
                      <p className="text-[10px] text-iron-dust font-mono uppercase mb-1">Total Invested</p>
                      <p className="text-xl font-bold text-blue-400">{fmtCurrency(importStats.investments)}</p>
                    </div>
                  </>
                )}
              </div>

              {errors.length > 0 && (
                <div className="w-full bg-amber-400/10 border border-amber-400/20 rounded-sm p-4 mb-5 text-left">
                  <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-2">{errors.length} rows skipped</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
                    {errors.map((e, i) => <p key={i} className="text-xs text-amber-400 font-mono">{e}</p>)}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={reset} className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors">
                  Import Another
                </button>
                <button onClick={handleClose} className="px-5 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="px-6 py-4 border-t border-white/5 bg-[#131517] flex justify-between items-center flex-shrink-0">
            <button
              onClick={() => {
                if (step === 'upload') handleClose();
                else if (step === 'map') reset();
                else setStep('map');
              }}
              className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
            >
              {step === 'upload' ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={() => {
                if (step === 'map') {
                  const errs = validateMapping();
                  if (errs.length) { setErrors(errs); return; }
                  setErrors([]); setStep('confirm');
                } else if (step === 'confirm') {
                  doImport();
                }
              }}
              disabled={step === 'upload'}
              className="px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 'map' ? `Review Import` : `Import ${csvRows.length} Rows`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
