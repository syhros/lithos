import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../context/FinanceContext';
import { Download, Upload, Trash2, AlertCircle, Check, LogOut, Database, CheckCircle2, XCircle, Loader2, LayoutGrid } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { CustomSelect, SelectGroup } from '../components/CustomSelect';

type LogEntry = {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error' | 'dim' | 'heading';
};

type PullPhase =
  | 'idle'
  | 'scanning'
  | 'cache_check'
  | 'compiling'
  | 'pulling'
  | 'done';

type ImportPhase = 'idle' | 'parsing' | 'importing' | 'done' | 'error';

export type CardSortOrder = 'az' | 'highest' | 'date';

export const CARD_SORT_KEY = 'lithos_card_sort_order';

export const getCardSortOrder = (): CardSortOrder => {
  const stored = localStorage.getItem(CARD_SORT_KEY);
  if (stored === 'az' || stored === 'highest' || stored === 'date') return stored;
  return 'highest';
};

const toDateOnly = (dateStr: string): string => dateStr.substring(0, 10);

const DELETE_OPTIONS: SelectGroup[] = [
  {
    options: [
      { value: 'none', label: 'Select deletion type\u2026' },
    ],
  },
  {
    label: 'Transactions',
    options: [
      {
        value: 'all_transactions',
        label: 'All Transactions',
        hint: 'removes every transaction record',
      },
      {
        value: 'recent_transactions',
        label: 'Recent Transactions',
        hint: 'delete last X months of transactions',
      },
    ],
  },
  {
    label: 'Assets & Debts',
    options: [
      {
        value: 'accounts',
        label: 'All Accounts',
        hint: 'resets all account balances to \u00a30',
      },
      {
        value: 'debts',
        label: 'All Debts',
        hint: 'removes all debt records',
      },
    ],
  },
  {
    label: 'Other Data',
    options: [
      {
        value: 'investments',
        label: 'All Investments',
        hint: 'clears investment transactions & holdings',
      },
      {
        value: 'bills',
        label: 'All Bills',
        hint: 'removes all bill & subscription records',
      },
    ],
  },
  {
    label: 'Danger Zone',
    options: [
      {
        value: 'factory_reset',
        label: 'Factory Reset',
        hint: 'deletes everything \u2014 irreversible',
      },
    ],
  },
];

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const {
    data,
    refreshData,
    addAccount,
    addTransaction,
    addDebt,
    addBill,
  } = useFinance();
  const [deleteType, setDeleteType] = useState<string>('none');
  const [monthsToDelete, setMonthsToDelete] = useState<number>(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Card sort order
  const [sortOrder, setSortOrder] = useState<CardSortOrder>(getCardSortOrder);

  const handleSortOrderChange = (order: CardSortOrder) => {
    setSortOrder(order);
    localStorage.setItem(CARD_SORT_KEY, order);
    // Dispatch storage event so other tabs / pages can react
    window.dispatchEvent(new StorageEvent('storage', { key: CARD_SORT_KEY, newValue: order }));
  };

  // JSON import state
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importMessage, setImportMessage] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const importInputRef = useRef<HTMLInputElement>(null);

  // Historic pull state
  const [pullPhase, setPullPhase] = useState<PullPhase>('idle');
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const stats = useMemo(() => {
    const txCount = data.transactions.length;
    const accountCount = data.assets.length;
    const debtCount = data.debts.length;
    const billCount = data.bills.length;
    const totalValue = data.assets.reduce((sum, a) => sum + a.startingValue, 0);
    return { txCount, accountCount, debtCount, billCount, totalValue };
  }, [data]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev, { id: ++logIdRef.current, text, type }]);
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = '';
    setImportFileName(file.name);
    setImportPhase('parsing');
    setImportMessage('Reading file\u2026');
    let parsed: any;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setImportPhase('error');
      setImportMessage('Invalid JSON file \u2014 could not parse.');
      return;
    }
    const hasTransactions = Array.isArray(parsed?.transactions);
    const hasAssets = Array.isArray(parsed?.assets);
    const hasDebts = Array.isArray(parsed?.debts);
    const hasBills = Array.isArray(parsed?.bills);
    if (!hasTransactions && !hasAssets && !hasDebts && !hasBills) {
      setImportPhase('error');
      setImportMessage('File does not look like a Lithos backup (no recognisable data arrays found).');
      return;
    }
    setImportPhase('importing');
    let imported = { accounts: 0, transactions: 0, debts: 0, bills: 0 };
    let errors: string[] = [];
    if (hasAssets) {
      for (const a of parsed.assets) {
        try {
          await addAccount({ name: a.name ?? 'Imported Account', type: a.type ?? 'checking', currency: a.currency ?? 'GBP', institution: a.institution ?? '', color: a.color ?? '#ffffff', startingValue: typeof a.startingValue === 'number' ? a.startingValue : 0, interestRate: a.interestRate, symbol: a.symbol, isClosed: a.isClosed ?? false, openedDate: a.openedDate, closedDate: a.closedDate });
          imported.accounts++;
        } catch (err: any) { errors.push(`Account "${a.name}": ${err?.message ?? 'unknown error'}`); }
      }
    }
    if (hasDebts) {
      for (const d of parsed.debts) {
        try {
          await addDebt({ name: d.name ?? 'Imported Debt', type: d.type ?? 'credit_card', limit: typeof d.limit === 'number' ? d.limit : 0, apr: typeof d.apr === 'number' ? d.apr : 0, minPaymentType: d.minPaymentType ?? 'fixed', minPaymentValue: typeof d.minPaymentValue === 'number' ? d.minPaymentValue : 0, startingValue: typeof d.startingValue === 'number' ? d.startingValue : 0, promo: d.promo });
          imported.debts++;
        } catch (err: any) { errors.push(`Debt "${d.name}": ${err?.message ?? 'unknown error'}`); }
      }
    }
    if (hasBills) {
      for (const b of parsed.bills) {
        try {
          await addBill({ name: b.name ?? 'Imported Bill', amount: typeof b.amount === 'number' ? b.amount : 0, dueDate: b.dueDate ?? b.due_date ?? new Date().toISOString().split('T')[0], isPaid: b.isPaid ?? false, autoPay: b.autoPay ?? false, category: b.category ?? 'Other', isRecurring: b.isRecurring ?? false, frequency: b.frequency, recurringEndDate: b.recurringEndDate });
          imported.bills++;
        } catch (err: any) { errors.push(`Bill "${b.name}": ${err?.message ?? 'unknown error'}`); }
      }
    }
    if (hasTransactions) {
      for (const t of parsed.transactions) {
        try {
          await addTransaction({ date: t.date ?? new Date().toISOString().split('T')[0], description: t.description ?? '', amount: typeof t.amount === 'number' ? t.amount : 0, type: t.type ?? 'expense', category: t.category ?? 'Other', accountId: t.accountId ?? t.account_id ?? undefined, notes: t.notes, symbol: t.symbol, quantity: t.quantity, price: t.price, currency: t.currency });
          imported.transactions++;
        } catch (err: any) { errors.push(`Transaction "${t.description}": ${err?.message ?? 'unknown error'}`); }
      }
    }
    if (errors.length === 0) {
      setImportPhase('done');
      const parts = [imported.accounts > 0 && `${imported.accounts} account${imported.accounts !== 1 ? 's' : ''}`, imported.debts > 0 && `${imported.debts} debt${imported.debts !== 1 ? 's' : ''}`, imported.bills > 0 && `${imported.bills} bill${imported.bills !== 1 ? 's' : ''}`, imported.transactions > 0 && `${imported.transactions} transaction${imported.transactions !== 1 ? 's' : ''}`].filter(Boolean).join(', ');
      setImportMessage(`Import complete \u2014 ${parts || 'nothing to import'}`);
    } else {
      setImportPhase('error');
      setImportMessage(`Imported with ${errors.length} error${errors.length !== 1 ? 's' : ''}: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` \u2026and ${errors.length - 3} more` : ''}`);
    }
    await refreshData();
  };

  const handlePullHistoricData = async () => {
    if (pullPhase !== 'idle' && pullPhase !== 'done') return;
    setLog([]);
    setPullPhase('scanning');
    const transactions = data?.transactions || [];
    const today = toDateOnly(new Date().toISOString());
    addLog('\u2501'.repeat(40), 'dim');
    addLog('PHASE 1 \u2014 Scanning transaction history', 'heading');
    addLog('\u2501'.repeat(40), 'dim');
    await sleep(150);
    const firstTxDate = new Map<string, string>();
    const investingTxs = transactions.filter(t => t.type === 'investing' && t.symbol && t.date);
    const allSymbols = Array.from(new Set(investingTxs.map(t => t.symbol!)));
    for (const sym of allSymbols) {
      addLog(`  Checking earliest transaction for ${sym}...`, 'dim');
      await sleep(30);
      const earliest = investingTxs.filter(t => t.symbol === sym).map(t => toDateOnly(t.date)).sort()[0];
      firstTxDate.set(sym, earliest);
      addLog(`  \u2192 ${sym}: first transaction on ${earliest}`, 'info');
    }
    addLog('', 'dim');
    addLog(`\u2713 Earliest transaction dates found for ${allSymbols.length} tickers`, 'success');
    await sleep(200);
    setPullPhase('cache_check');
    addLog('', 'dim');
    addLog('\u2501'.repeat(40), 'dim');
    addLog('PHASE 2 \u2014 Checking price history cache', 'heading');
    addLog('\u2501'.repeat(40), 'dim');
    await sleep(150);
    const toFetch = new Map<string, { from: string; to: string }>();
    const ignored: string[] = [];
    for (const sym of allSymbols) {
      const txFrom = firstTxDate.get(sym)!;
      addLog(`  Checking cache for ${sym} (need from ${txFrom})...`, 'dim');
      await sleep(40);
      const { data: cached } = await supabase.from('price_history_cache').select('date').eq('symbol', sym).order('date', { ascending: true }).limit(1).single();
      const cacheStart = cached?.date ? toDateOnly(cached.date) : null;
      if (cacheStart && cacheStart <= txFrom) { addLog(`  \u2192 ${sym}: cache covers ${cacheStart} \u2713 \u2014 skipping`, 'success'); ignored.push(sym); }
      else if (cacheStart) { addLog(`  \u2192 ${sym}: cache starts ${cacheStart}, need ${txFrom} \u2014 gap: ${txFrom} \u2192 ${cacheStart}`, 'info'); toFetch.set(sym, { from: txFrom, to: cacheStart }); }
      else { addLog(`  \u2192 ${sym}: no cache found \u2014 will fetch ${txFrom} \u2192 ${today}`, 'info'); toFetch.set(sym, { from: txFrom, to: today }); }
    }
    addLog('', 'dim');
    if (ignored.length > 0) addLog(`\u2713 ${ignored.length} ticker(s) already fully cached: ${ignored.join(', ')}`, 'success');
    addLog(`\u2192 ${toFetch.size} ticker(s) require a fetch`, 'info');
    await sleep(200);
    if (toFetch.size === 0) { addLog('', 'dim'); addLog('\u2713 All tickers are fully cached. Nothing to do!', 'success'); setPullPhase('done'); return; }
    setPullPhase('compiling');
    addLog('', 'dim');
    addLog('\u2501'.repeat(40), 'dim');
    addLog('PHASE 3 \u2014 Compiling request list', 'heading');
    addLog('\u2501'.repeat(40), 'dim');
    await sleep(150);
    for (const [sym, range] of toFetch.entries()) { addLog(`  ${sym.padEnd(16)} ${range.from} \u2192 ${range.to}`, 'info'); await sleep(25); }
    addLog('', 'dim');
    addLog(`\u2713 Request list compiled \u2014 ${toFetch.size} ticker(s) queued`, 'success');
    await sleep(200);
    setPullPhase('pulling');
    addLog('', 'dim');
    addLog('\u2501'.repeat(40), 'dim');
    addLog('PHASE 4 \u2014 Pulling price history', 'heading');
    addLog('\u2501'.repeat(40), 'dim');
    await sleep(150);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    let totalRows = 0;
    let errors = 0;
    for (const [sym, range] of toFetch.entries()) {
      addLog(`  Requesting price history for ${sym} (${range.from} \u2192 ${range.to})...`, 'info');
      try {
        const url = `${supabaseUrl}/functions/v1/backfill-price-history?symbols=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { addLog(`  \u2717 ${sym}: HTTP ${res.status}`, 'error'); errors++; }
        else {
          const json = await res.json();
          const result = json?.summary?.[sym];
          if (result?.error) { addLog(`  \u2717 ${sym}: ${result.error}`, 'error'); errors++; }
          else { const rows = result?.rows ?? 0; totalRows += rows; addLog(`  \u2713 ${sym} complete \u2014 ${rows.toLocaleString()} rows cached`, 'success'); }
        }
      } catch (e: any) { addLog(`  \u2717 ${sym}: ${e.message || 'Network error'}`, 'error'); errors++; }
    }
    addLog('', 'dim');
    addLog('\u2501'.repeat(40), 'dim');
    addLog(`COMPLETE \u2014 ${totalRows.toLocaleString()} rows cached${errors > 0 ? `, ${errors} error(s)` : ''}`, errors > 0 ? 'error' : 'success');
    addLog('\u2501'.repeat(40), 'dim');
    setPullPhase('done');
    await refreshData();
  };

  const handleExportCSV = () => {
    let csv = '';
    csv += 'TRANSACTIONS\n';
    csv += 'Date,Description,Amount,Type,Category,Account\n';
    data.transactions.forEach(tx => { csv += `${tx.date},"${tx.description}",${tx.amount},${tx.type},${tx.category},${tx.accountId}\n`; });
    csv += '\n\nACCOUNTS\n';
    csv += 'Name,Type,Institution,Currency,Starting Value,Interest Rate\n';
    data.assets.forEach(a => { csv += `"${a.name}",${a.type},"${a.institution}",${a.currency},${a.startingValue},"${a.interestRate || ''}"\n`; });
    csv += '\n\nDEBTS\n';
    csv += 'Name,Type,Limit,APR,Min Payment Type,Min Payment Value,Starting Value\n';
    data.debts.forEach(d => { csv += `"${d.name}",${d.type},${d.limit},${d.apr},${d.minPaymentType},${d.minPaymentValue},${d.startingValue}\n`; });
    csv += '\n\nBILLS\n';
    csv += 'Name,Amount,Due Date,Category,Auto Pay,Is Paid\n';
    data.bills.forEach(b => { csv += `"${b.name}",${b.amount},"${b.dueDate}",${b.category},${b.autoPay},${b.isPaid}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `lithos-finance-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `lithos-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (!confirmDelete || deleteType === 'none') return;
    setDeleteSuccess(true); setConfirmDelete(false); setDeleteType('none');
    setTimeout(() => setDeleteSuccess(false), 3000);
  };

  const isPulling = pullPhase !== 'idle' && pullPhase !== 'done';
  const phaseLabel: Record<PullPhase, string> = {
    idle: 'Pull Historic Price Data', scanning: 'Scanning transactions...', cache_check: 'Checking cache...',
    compiling: 'Compiling requests...', pulling: 'Pulling data...', done: 'Pull Complete',
  };

  const sortOptions: { value: CardSortOrder; label: string; desc: string }[] = [
    { value: 'highest', label: 'Highest \u2192 Lowest', desc: 'Sort by balance, largest first' },
    { value: 'az',      label: 'A \u2192 Z',           desc: 'Sort alphabetically by name' },
    { value: 'date',    label: 'Date Added',           desc: 'Sort by when the account was created' },
  ];

  return (
    <div className="p-12 max-w-4xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-start mb-8">
        <div>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-1">Settings</h1>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 bg-red-900/10 border border-red-900/30 text-red-400 text-xs font-bold uppercase rounded-sm hover:bg-red-900/20 transition-colors">
          <LogOut size={14} /> Logout
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-12">
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Transactions</div>
          <div className="text-2xl font-bold text-white">{stats.txCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Accounts</div>
          <div className="text-2xl font-bold text-white">{stats.accountCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Debts</div>
          <div className="text-2xl font-bold text-white">{stats.debtCount}</div>
        </div>
        <div className="bg-[#161618] border border-white/5 p-4 rounded-sm">
          <div className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Bills</div>
          <div className="text-2xl font-bold text-white">{stats.billCount}</div>
        </div>
      </div>

      <div className="space-y-8">

        {/* Card Sort Order */}
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <LayoutGrid size={18} /> Card Sort Order
          </h3>
          <p className="text-sm text-iron-dust mb-6">Choose how account, investment, and debt cards are ordered across all pages.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            {sortOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSortOrderChange(opt.value)}
                className={clsx(
                  'flex-1 text-left p-4 rounded-sm border transition-all',
                  sortOrder === opt.value
                    ? 'border-magma/60 bg-magma/10 text-white'
                    : 'border-white/5 bg-black/20 text-iron-dust hover:border-white/10 hover:text-white'
                )}
              >
                <span className="block text-xs font-bold uppercase tracking-wider mb-1">{opt.label}</span>
                <span className="block text-[10px] font-mono opacity-60">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Export */}
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Download size={18} /> Export Data</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-iron-dust mb-3">Export all your financial data as CSV for use in spreadsheets</p>
              <button onClick={handleExportCSV} className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">
                <Download size={14} /> Export as CSV
              </button>
            </div>
            <div>
              <p className="text-sm text-iron-dust mb-3">Export complete backup as JSON for archiving or migration</p>
              <button onClick={handleExportJSON} className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">
                <Download size={14} /> Export as JSON
              </button>
            </div>
          </div>
        </div>

        {/* Import + Historic Pull */}
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Upload size={18} /> Import Data</h3>
          <div className="space-y-8">
            <div>
              <p className="text-sm text-iron-dust mb-4">Import a previously exported JSON backup to restore your data</p>
              <label className={clsx(
                'flex items-center gap-2 px-6 py-3 rounded-sm text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer w-fit border',
                importPhase === 'importing' || importPhase === 'parsing' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-not-allowed pointer-events-none' :
                importPhase === 'done' ? 'bg-emerald-vein/10 border-emerald-vein/30 text-emerald-vein hover:bg-emerald-vein/20' :
                importPhase === 'error' ? 'bg-red-900/20 border-red-900/30 text-red-400 hover:bg-red-900/30' :
                'bg-white/10 border-white/20 text-white hover:bg-white/15'
              )}>
                {importPhase === 'importing' || importPhase === 'parsing' ? <Loader2 size={14} className="animate-spin" /> :
                 importPhase === 'done' ? <CheckCircle2 size={14} /> :
                 importPhase === 'error' ? <XCircle size={14} /> :
                 <Upload size={14} />}
                {importPhase === 'parsing' ? 'Parsing\u2026' : importPhase === 'importing' ? 'Importing\u2026' : importPhase === 'done' ? 'Import Complete' : importPhase === 'error' ? 'Import Failed \u2014 Try Again' : 'Choose JSON File'}
                <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} disabled={importPhase === 'importing' || importPhase === 'parsing'} />
              </label>
              {importMessage && (
                <div className={clsx('mt-3 flex items-start gap-2 text-sm font-mono rounded-sm px-4 py-3 border',
                  importPhase === 'done' ? 'bg-emerald-vein/5 border-emerald-vein/20 text-emerald-vein' :
                  importPhase === 'error' ? 'bg-red-900/10 border-red-900/30 text-red-400' :
                  'bg-white/5 border-white/10 text-white/70')}>
                  {importPhase === 'done' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : importPhase === 'error' ? <XCircle size={14} className="shrink-0 mt-0.5" /> : <Loader2 size={14} className="animate-spin shrink-0 mt-0.5" />}
                  <span>{importFileName && <span className="text-iron-dust mr-1">[{importFileName}]</span>}{importMessage}</span>
                </div>
              )}
            </div>
            <div className="border-t border-white/5" />
            <div>
              <p className="text-sm font-bold text-white mb-1">Pull Historic Price Data</p>
              <p className="text-sm text-iron-dust">Backfills missing price history for all investment holdings. Checks the cache first and only requests the uncached date range per ticker.</p>
              <button onClick={handlePullHistoricData} disabled={isPulling} className={clsx('mt-4 flex items-center gap-2 px-6 py-3 rounded-sm text-sm font-bold uppercase tracking-wider border transition-all',
                isPulling ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-not-allowed' :
                pullPhase === 'done' ? 'bg-emerald-vein/10 border-emerald-vein/30 text-emerald-vein hover:bg-emerald-vein/20' :
                'bg-white/10 border-white/20 text-white hover:bg-white/15')}>
                {isPulling ? <Loader2 size={14} className="animate-spin" /> : pullPhase === 'done' ? <CheckCircle2 size={14} /> : <Database size={14} />}
                {phaseLabel[pullPhase]}
              </button>
              {log.length > 0 && (
                <div className="mt-4 bg-[#0a0b0c] border border-white/8 rounded-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#111314] border-b border-white/5">
                    <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500/60" /><div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" /><div className="w-2.5 h-2.5 rounded-full bg-green-500/60" /></div>
                    <span className="text-[10px] font-mono text-iron-dust/50 ml-2 uppercase tracking-widest">lithos price history console</span>
                    {isPulling && <Loader2 size={10} className="animate-spin text-blue-400 ml-auto" />}
                    {pullPhase === 'done' && <CheckCircle2 size={10} className="text-emerald-vein ml-auto" />}
                  </div>
                  <div ref={logRef} className="max-h-[340px] overflow-y-auto custom-scrollbar p-4 space-y-0.5 font-mono text-[11px] leading-relaxed">
                    {log.map(entry => (
                      <div key={entry.id} className={clsx(
                        entry.type === 'heading' && 'text-blue-400 font-bold', entry.type === 'success' && 'text-emerald-vein',
                        entry.type === 'error' && 'text-magma', entry.type === 'info' && 'text-white/80', entry.type === 'dim' && 'text-white/20',
                      )}>{entry.text || '\u00a0'}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete */}
        <div className="border border-red-900/30 rounded-sm p-8 bg-red-900/5">
          <h3 className="text-lg font-bold text-red-400 mb-6 flex items-center gap-2"><Trash2 size={18} /> Delete Data</h3>
          <div className="space-y-4">
            <p className="text-sm text-iron-dust">Permanently delete specific data. This action cannot be undone.</p>
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Select Data to Delete</label>
              <CustomSelect value={deleteType} onChange={v => { setDeleteType(v); setConfirmDelete(false); }} groups={DELETE_OPTIONS} placeholder="Select deletion type\u2026" maxVisibleItems={8} />
            </div>
            {deleteType === 'recent_transactions' && (
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Months to Delete</label>
                <input type="number" min="1" max="120" value={monthsToDelete} onChange={e => setMonthsToDelete(parseInt(e.target.value))} className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono" />
              </div>
            )}
            {deleteType !== 'none' && deleteType !== 'factory_reset' && (
              <div className="bg-yellow-900/10 border border-yellow-900/30 rounded-sm p-4 flex gap-3">
                <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-600">This will permanently delete the selected data. Make sure you have a backup.</div>
              </div>
            )}
            {deleteType === 'factory_reset' && (
              <div className="bg-red-900/20 border border-red-900/50 rounded-sm p-4 flex gap-3">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-400">This will delete ALL your financial data including transactions, accounts, debts, bills, and investments. This action is permanent and cannot be undone.</div>
              </div>
            )}
            {deleteType !== 'none' && (
              <div className="flex gap-3">
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="px-6 py-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-900/30 transition-colors">Confirm Delete</button>
                ) : (
                  <>
                    <button onClick={() => setConfirmDelete(false)} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">Cancel</button>
                    <button onClick={handleDelete} className="px-6 py-3 bg-red-600 border border-red-600 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-700 transition-colors">Delete Permanently</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {deleteSuccess && (
          <div className="bg-emerald-900/10 border border-emerald-900/30 rounded-sm p-4 flex gap-3 animate-in fade-in">
            <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-400">Data deleted successfully</div>
          </div>
        )}
      </div>
    </div>
  );
};
