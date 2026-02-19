import React, { useState, useRef, useCallback, useMemo } from 'react';
import { X, Upload, FileText, Download, AlertTriangle, CheckCircle, ChevronDown } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { TransactionType, Currency } from '../data/mockData';
import { clsx } from 'clsx';

type ImportMode = 'accounts' | 'investments';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// --- Field Definitions ---

interface AccountFieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

const ACCOUNT_FIELDS: AccountFieldDef[] = [
  { key: 'type',        label: 'Type',        required: true,  description: 'income, expense, debt_payment, transfer' },
  { key: 'date',        label: 'Date',         required: true,  description: 'e.g. 2024-01-15 or 15/01/2024' },
  { key: 'amount',      label: 'Amount',       required: true,  description: 'Numeric value' },
  { key: 'description', label: 'Merchant',     required: false, description: 'Payee / merchant name' },
  { key: 'category',    label: 'Category',     required: false, description: 'e.g. Groceries' },
  { key: 'time',        label: 'Time',         required: false, description: 'HH:MM (optional)' },
  { key: 'accountId',   label: 'Account',      required: false, description: 'Account name (used when no single account selected)' },
];

const INVESTMENT_FIELDS: AccountFieldDef[] = [
  { key: 'symbol',   label: 'Ticker',       required: true,  description: 'e.g. AAPL, TSLA' },
  { key: 'date',     label: 'Date',          required: true,  description: 'e.g. 2024-01-15' },
  { key: 'quantity', label: 'Shares / Qty',  required: true,  description: 'Number of units' },
  { key: 'price',    label: 'Price / Unit',  required: true,  description: 'Price in native currency' },
  { key: 'currency', label: 'Currency',      required: false, description: 'GBP, USD, EUR' },
  { key: 'description', label: 'Asset Name', required: false, description: 'e.g. Apple Inc.' },
  { key: 'category', label: 'Asset Type',    required: false, description: 'Stock, ETF, Crypto...' },
  { key: 'time',     label: 'Time',          required: false, description: 'HH:MM (optional)' },
];

const USD_TO_GBP = 0.74;

// --- CSV Parsing ---

const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseRow);
  return { headers, rows };
};

const parseDate = (raw: string, time?: string): string => {
  if (!raw) return new Date().toISOString();
  const cleaned = raw.trim();
  let date: Date | null = null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    date = new Date(cleaned.slice(0, 10));
  }
  // DD/MM/YYYY
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(cleaned)) {
    const [d, m, y] = cleaned.split('/');
    date = new Date(`${y}-${m}-${d}`);
  }
  // MM/DD/YYYY
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleaned)) {
    const parts = cleaned.split('/');
    date = new Date(`${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`);
  }
  if (!date || isNaN(date.getTime())) date = new Date(cleaned);
  if (!date || isNaN(date.getTime())) date = new Date();

  const dateStr = date.toISOString().split('T')[0];
  const timeStr = time?.trim() ? time.trim() : '12:00';
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
};

const AUTO_MAPPING: Record<string, string[]> = {
  date:        ['date', 'transaction date', 'trans date', 'posted date', 'value date'],
  amount:      ['amount', 'value', 'debit/credit', 'transaction amount', 'credit', 'debit'],
  description: ['description', 'merchant', 'payee', 'reference', 'narrative', 'details', 'memo'],
  category:    ['category', 'type', 'transaction type'],
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
      if (!result[field] && aliases.includes(lower)) {
        result[field] = h;
      }
    });
  });
  return result;
};

// --- Template Downloads ---

const downloadTemplate = (mode: ImportMode) => {
  let csv = '';
  if (mode === 'accounts') {
    csv = 'type,date,amount,description,category,time,account\n';
    csv += 'expense,2024-01-15,-45.50,Waitrose,Groceries,09:30,Monzo Current\n';
    csv += 'income,2024-01-01,4200.00,Tech Solutions Ltd,Salary,08:00,Monzo Current\n';
    csv += 'debt_payment,2024-01-20,-150.00,Amex Payment,Payment,12:00,Monzo Current\n';
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

// --- Main Component ---

type Step = 'upload' | 'map' | 'preview' | 'done';

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

  const fileRef = useRef<HTMLInputElement>(null);

  const activeFields = mode === 'accounts' ? ACCOUNT_FIELDS : INVESTMENT_FIELDS;

  const allAccounts = useMemo(() => [
    ...data.assets.map(a => ({ id: a.id, name: a.name, group: a.type === 'investment' ? 'Investment' : 'Asset' })),
    ...data.debts.map(d => ({ id: d.id, name: d.name, group: 'Debt' })),
  ], [data]);

  const accountAccounts = useMemo(() =>
    allAccounts.filter(a => a.group !== 'Investment'),
    [allAccounts]
  );

  const investmentAccounts = useMemo(() =>
    data.assets.filter(a => a.type === 'investment'),
    [data.assets]
  );

  const reset = () => {
    setStep('upload');
    setFileName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setSelectedAccountId('');
    setErrors([]);
    setImportCount(0);
    setIsDragging(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrors(['Only .csv files are supported.']);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (!headers.length) {
        setErrors(['Could not parse CSV. Make sure it has a header row.']);
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setFileName(file.name);
      setMapping(autoDetect(headers));
      setErrors([]);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [mode]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const getCellValue = (row: string[], fieldKey: string): string => {
    const header = mapping[fieldKey];
    if (!header) return '';
    const idx = csvHeaders.indexOf(header);
    return idx >= 0 ? (row[idx] || '') : '';
  };

  const previewRows = csvRows.slice(0, 10);

  // Validation before import
  const validateMapping = (): string[] => {
    const errs: string[] = [];
    const required = activeFields.filter(f => f.required);
    required.forEach(f => {
      if (!mapping[f.key]) errs.push(`Required field "${f.label}" is not mapped.`);
    });
    if (mode === 'accounts' && !selectedAccountId) {
      const hasAccountCol = !!mapping['accountId'];
      if (!hasAccountCol) errs.push('Select an account or map the Account column.');
    }
    if (mode === 'investments' && !selectedAccountId) {
      errs.push('Select an investment account.');
    }
    return errs;
  };

  const resolveAccountId = (row: string[]): string => {
    if (selectedAccountId) return selectedAccountId;
    const nameVal = getCellValue(row, 'accountId').trim().toLowerCase();
    const found = allAccounts.find(a => a.name.toLowerCase() === nameVal);
    return found?.id || '';
  };

  const normalizeType = (raw: string): TransactionType => {
    const lower = raw.toLowerCase().trim();
    if (['income', 'credit'].includes(lower)) return 'income';
    if (['expense', 'debit', 'purchase'].includes(lower)) return 'expense';
    if (['debt_payment', 'payment'].includes(lower)) return 'debt_payment';
    if (['transfer'].includes(lower)) return 'transfer';
    if (['invest', 'investing', 'buy', 'sell'].includes(lower)) return 'investing';
    return 'expense';
  };

  const doImport = () => {
    const errs = validateMapping();
    if (errs.length) { setErrors(errs); return; }

    let count = 0;
    const newErrors: string[] = [];

    csvRows.forEach((row, i) => {
      try {
        if (mode === 'accounts') {
          const rawType = getCellValue(row, 'type');
          const rawDate = getCellValue(row, 'date');
          const rawAmount = getCellValue(row, 'amount').replace(/[£$€,\s]/g, '');
          const description = getCellValue(row, 'description') || 'Imported Transaction';
          const category = getCellValue(row, 'category') || 'General';
          const time = getCellValue(row, 'time') || '12:00';
          const accountId = resolveAccountId(row);

          if (!accountId) {
            newErrors.push(`Row ${i + 2}: Could not resolve account.`);
            return;
          }

          const amount = parseFloat(rawAmount);
          if (isNaN(amount)) {
            newErrors.push(`Row ${i + 2}: Invalid amount "${rawAmount}".`);
            return;
          }

          const type = normalizeType(rawType);
          const date = parseDate(rawDate, time);

          addTransaction({ date, description, amount, type, category, accountId });
          count++;
        } else {
          const symbol = getCellValue(row, 'symbol').toUpperCase();
          const rawDate = getCellValue(row, 'date');
          const rawQty = getCellValue(row, 'quantity').replace(/[,\s]/g, '');
          const rawPrice = getCellValue(row, 'price').replace(/[£$€,\s]/g, '');
          const rawCurrency = getCellValue(row, 'currency').toUpperCase() || 'GBP';
          const description = getCellValue(row, 'description') || symbol;
          const category = getCellValue(row, 'category') || 'Stock';
          const time = getCellValue(row, 'time') || '12:00';
          const accountId = selectedAccountId;

          if (!symbol) {
            newErrors.push(`Row ${i + 2}: Missing ticker symbol.`);
            return;
          }

          const qty = parseFloat(rawQty);
          const price = parseFloat(rawPrice);

          if (isNaN(qty) || isNaN(price)) {
            newErrors.push(`Row ${i + 2}: Invalid quantity or price.`);
            return;
          }

          const validCurrency: Currency = ['GBP', 'USD', 'EUR'].includes(rawCurrency)
            ? rawCurrency as Currency
            : 'GBP';

          const nativeTotal = qty * price;
          const gbpAmount = validCurrency === 'USD' ? nativeTotal * USD_TO_GBP : nativeTotal;
          const date = parseDate(rawDate, time);

          addTransaction({
            date,
            description,
            amount: gbpAmount,
            type: 'investing',
            category,
            accountId,
            symbol,
            quantity: qty,
            price,
            currency: validCurrency,
          });
          count++;
        }
      } catch (e) {
        newErrors.push(`Row ${i + 2}: Unexpected error.`);
      }
    });

    setImportCount(count);
    setErrors(newErrors);
    setStep('done');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-3xl rounded-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Import CSV</h3>
            {step !== 'done' && (
              <div className="flex bg-black/30 border border-white/5 rounded-sm overflow-hidden">
                {(['accounts', 'investments'] as ImportMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { if (step === 'upload') setMode(m); }}
                    disabled={step !== 'upload'}
                    className={clsx(
                      'px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all',
                      mode === m ? 'bg-magma text-black' : 'text-iron-dust hover:text-white disabled:cursor-default'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'upload' && (
              <button
                onClick={() => downloadTemplate(mode)}
                className="flex items-center gap-2 px-3 py-1.5 border border-white/10 text-iron-dust text-[10px] font-mono uppercase tracking-wider rounded-sm hover:text-white hover:border-white/20 transition-colors"
              >
                <Download size={12} />
                Template
              </button>
            )}
            <button onClick={handleClose} className="text-iron-dust hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex border-b border-white/5 flex-shrink-0">
            {(['upload', 'map', 'preview'] as Step[]).map((s, i) => (
              <div key={s} className={clsx(
                'flex-1 py-2.5 text-center text-[10px] font-mono uppercase tracking-[2px] transition-colors',
                step === s ? 'text-white border-b-2 border-magma' : 'text-iron-dust'
              )}>
                {i + 1}. {s === 'upload' ? 'Upload' : s === 'map' ? 'Map Fields' : 'Preview & Import'}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* === STEP 1: UPLOAD === */}
          {step === 'upload' && (
            <div className="p-8">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-sm p-16 flex flex-col items-center justify-center cursor-pointer transition-all',
                  isDragging ? 'border-magma bg-magma/5' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
                )}
              >
                <Upload size={40} className={clsx('mb-4 transition-colors', isDragging ? 'text-magma' : 'text-iron-dust')} />
                <p className="text-white font-bold mb-1">Drop your CSV here</p>
                <p className="text-iron-dust text-xs font-mono">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {errors.length > 0 && (
                <div className="mt-4 bg-magma/10 border border-magma/30 rounded-sm p-4">
                  {errors.map((e, i) => <p key={i} className="text-xs text-magma font-mono">{e}</p>)}
                </div>
              )}

              <div className="mt-6 bg-black/20 border border-white/5 rounded-sm p-5">
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">
                  {mode === 'accounts' ? 'Accounts & Debts' : 'Investment'} Import — Expected Fields
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {activeFields.map(f => (
                    <div key={f.key} className="flex items-start gap-2">
                      <span className={clsx(
                        'mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                        f.required ? 'bg-magma' : 'bg-iron-dust'
                      )} />
                      <div>
                        <span className="text-[11px] text-white font-mono">{f.label}</span>
                        {f.required && <span className="text-magma text-[10px] ml-1">*</span>}
                        <p className="text-[10px] text-iron-dust">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-iron-dust mt-3">
                  <span className="text-magma">*</span> Required — Download the template to get started.
                </p>
              </div>
            </div>
          )}

          {/* === STEP 2: MAP === */}
          {step === 'map' && (
            <div className="p-8 space-y-6">
              {/* File info */}
              <div className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-sm p-4">
                <FileText size={16} className="text-iron-dust flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-mono truncate">{fileName}</p>
                  <p className="text-[10px] text-iron-dust">{csvRows.length} rows · {csvHeaders.length} columns</p>
                </div>
                <button
                  onClick={reset}
                  className="text-[10px] font-mono text-iron-dust uppercase tracking-wider hover:text-white transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Account selector */}
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                  {mode === 'accounts' ? 'Account (applies to all rows — leave blank to use CSV Account column)' : 'Investment Account *'}
                </label>
                <div className="relative">
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-3 pr-10 text-sm text-white rounded-sm focus:border-magma outline-none appearance-none"
                  >
                    <option value="">
                      {mode === 'accounts' ? '— Use CSV Account column —' : 'Select investment account...'}
                    </option>
                    {mode === 'accounts' ? (
                      <>
                        <optgroup label="Assets">
                          {accountAccounts.filter(a => a.group === 'Asset').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Debts">
                          {accountAccounts.filter(a => a.group === 'Debt').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </optgroup>
                      </>
                    ) : (
                      <optgroup label="Investment Accounts">
                        {investmentAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-iron-dust pointer-events-none" />
                </div>
              </div>

              {/* Column mapping */}
              <div>
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Map CSV Columns to Fields</p>
                <div className="space-y-3">
                  {activeFields.map(field => (
                    <div key={field.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'w-1.5 h-1.5 rounded-full flex-shrink-0',
                          field.required ? 'bg-magma' : 'bg-white/20'
                        )} />
                        <div>
                          <span className="text-sm text-white">{field.label}</span>
                          {field.required && <span className="text-magma text-xs ml-1">*</span>}
                          <p className="text-[10px] text-iron-dust">{field.description}</p>
                        </div>
                      </div>
                      <span className="text-iron-dust text-xs font-mono">←</span>
                      <div className="relative">
                        <select
                          value={mapping[field.key] || ''}
                          onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className={clsx(
                            'w-full bg-black/20 border p-2.5 pr-8 text-sm rounded-sm focus:outline-none appearance-none transition-colors',
                            mapping[field.key]
                              ? 'border-emerald-vein/40 text-white focus:border-emerald-vein'
                              : field.required
                                ? 'border-white/10 text-iron-dust focus:border-magma'
                                : 'border-white/5 text-iron-dust focus:border-white/20'
                          )}
                        >
                          <option value="">— Not mapped —</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-iron-dust pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {errors.length > 0 && (
                <div className="bg-magma/10 border border-magma/30 rounded-sm p-4">
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

          {/* === STEP 3: PREVIEW === */}
          {step === 'preview' && (
            <div className="p-8 space-y-6">
              <div>
                <p className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-1">Preview</p>
                <p className="text-xs text-iron-dust">First {Math.min(10, csvRows.length)} of {csvRows.length} rows. All rows will be imported.</p>
              </div>

              <div className="overflow-x-auto rounded-sm border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#131517]">
                    <tr>
                      <th className="py-2 px-3 text-[10px] font-mono text-iron-dust uppercase tracking-wider border-b border-white/5">#</th>
                      {activeFields.filter(f => mapping[f.key]).map(f => (
                        <th key={f.key} className="py-2 px-3 text-[10px] font-mono text-iron-dust uppercase tracking-wider border-b border-white/5 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                      {selectedAccountId && (
                        <th className="py-2 px-3 text-[10px] font-mono text-iron-dust uppercase tracking-wider border-b border-white/5">Account</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {previewRows.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-iron-dust font-mono">{i + 1}</td>
                        {activeFields.filter(f => mapping[f.key]).map(f => {
                          const val = getCellValue(row, f.key);
                          const isAmount = f.key === 'amount' || f.key === 'price';
                          const numVal = isAmount ? parseFloat(val.replace(/[£$€,\s]/g, '')) : NaN;
                          return (
                            <td key={f.key} className={clsx(
                              'py-2.5 px-3 font-mono max-w-[160px] truncate',
                              isAmount && !isNaN(numVal)
                                ? numVal >= 0 ? 'text-emerald-vein' : 'text-magma'
                                : 'text-white'
                            )}>
                              {val || <span className="text-iron-dust/40">—</span>}
                            </td>
                          );
                        })}
                        {selectedAccountId && (
                          <td className="py-2.5 px-3 text-iron-dust font-mono text-[10px]">
                            {allAccounts.find(a => a.id === selectedAccountId)?.name || ''}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvRows.length > 10 && (
                <p className="text-[10px] text-iron-dust font-mono text-center">
                  + {csvRows.length - 10} more rows not shown
                </p>
              )}

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

          {/* === DONE === */}
          {step === 'done' && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <CheckCircle size={48} className="text-emerald-vein mb-6" />
              <h3 className="text-2xl font-bold text-white mb-2">{importCount} transactions imported</h3>
              <p className="text-iron-dust text-sm font-mono mb-6">
                From <span className="text-white">{fileName}</span>
              </p>
              {errors.length > 0 && (
                <div className="w-full bg-amber-400/10 border border-amber-400/20 rounded-sm p-4 mb-6 text-left">
                  <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-2">{errors.length} rows skipped</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {errors.map((e, i) => <p key={i} className="text-xs text-amber-400 font-mono">{e}</p>)}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="px-6 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
                >
                  Import Another
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="p-5 border-t border-white/5 bg-[#131517] flex justify-between items-center flex-shrink-0">
            <button
              onClick={step === 'upload' ? handleClose : step === 'map' ? reset : () => setStep('map')}
              className="px-5 py-2.5 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
            >
              {step === 'upload' ? 'Cancel' : 'Back'}
            </button>
            <div className="flex items-center gap-3">
              {step === 'preview' && (
                <span className="text-[10px] font-mono text-iron-dust">{csvRows.length} rows to import</span>
              )}
              <button
                onClick={() => {
                  if (step === 'map') {
                    const errs = validateMapping();
                    if (errs.length) { setErrors(errs); return; }
                    setErrors([]);
                    setStep('preview');
                  } else if (step === 'preview') {
                    doImport();
                  }
                }}
                disabled={step === 'upload'}
                className="px-6 py-2.5 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 'map' ? 'Preview' : step === 'preview' ? `Import ${csvRows.length} Rows` : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
