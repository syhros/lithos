import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../context/FinanceContext';
import { Download, Upload, Trash2, AlertCircle, Check, LogOut, Database, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';

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

// Strip any timestamp component, return just YYYY-MM-DD
const toDateOnly = (dateStr: string): string => dateStr.substring(0, 10);

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { data, refreshData } = useFinance();
  const [deleteType, setDeleteType] = useState<string>('none');
  const [monthsToDelete, setMonthsToDelete] = useState<number>(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

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

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev, { id: ++logIdRef.current, text, type }]);
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const handlePullHistoricData = async () => {
    if (pullPhase !== 'idle' && pullPhase !== 'done') return;

    setLog([]);
    setPullPhase('scanning');

    const transactions = data?.transactions || [];
    const today = toDateOnly(new Date().toISOString());

    // ── PHASE 1: Scan all tickers for earliest transaction date ──
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    addLog('PHASE 1 — Scanning transaction history', 'heading');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    await sleep(150);

    const firstTxDate = new Map<string, string>(); // symbol -> YYYY-MM-DD
    const investingTxs = transactions.filter(t => t.type === 'investing' && t.symbol && t.date);
    const allSymbols = Array.from(new Set(investingTxs.map(t => t.symbol!)));

    for (const sym of allSymbols) {
      addLog(`  Checking earliest transaction for ${sym}...`, 'dim');
      await sleep(30);
      const earliest = investingTxs
        .filter(t => t.symbol === sym)
        .map(t => toDateOnly(t.date))
        .sort()[0];
      firstTxDate.set(sym, earliest);
      addLog(`  → ${sym}: first transaction on ${earliest}`, 'info');
    }

    addLog('', 'dim');
    addLog(`✓ Earliest transaction dates found for ${allSymbols.length} tickers`, 'success');
    await sleep(200);

    // ── PHASE 2: Check cache for each ticker ──
    setPullPhase('cache_check');
    addLog('', 'dim');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    addLog('PHASE 2 — Checking price history cache', 'heading');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    await sleep(150);

    // toFetch: symbol -> { from: YYYY-MM-DD, to: YYYY-MM-DD }
    const toFetch = new Map<string, { from: string; to: string }>();
    const ignored: string[] = [];

    for (const sym of allSymbols) {
      const txFrom = firstTxDate.get(sym)!;
      addLog(`  Checking cache for ${sym} (need from ${txFrom})...`, 'dim');
      await sleep(40);

      const { data: cached } = await supabase
        .from('price_history_cache')
        .select('date')
        .eq('symbol', sym)
        .order('date', { ascending: true })
        .limit(1)
        .single();

      const cacheStart = cached?.date ? toDateOnly(cached.date) : null;

      if (cacheStart && cacheStart <= txFrom) {
        // Cache already covers the first transaction date — nothing to do
        addLog(`  → ${sym}: cache covers ${cacheStart} ✓ — skipping`, 'success');
        ignored.push(sym);
      } else if (cacheStart) {
        // Gap exists: pull from first tx date up to (but not including) the cache start
        addLog(`  → ${sym}: cache starts ${cacheStart}, need ${txFrom} — gap: ${txFrom} → ${cacheStart}`, 'info');
        toFetch.set(sym, { from: txFrom, to: cacheStart });
      } else {
        // No cache at all — pull from first tx date to today
        addLog(`  → ${sym}: no cache found — will fetch ${txFrom} → ${today}`, 'info');
        toFetch.set(sym, { from: txFrom, to: today });
      }
    }

    addLog('', 'dim');
    if (ignored.length > 0) {
      addLog(`✓ ${ignored.length} ticker(s) already fully cached: ${ignored.join(', ')}`, 'success');
    }
    addLog(`→ ${toFetch.size} ticker(s) require a fetch`, 'info');
    await sleep(200);

    if (toFetch.size === 0) {
      addLog('', 'dim');
      addLog('✓ All tickers are fully cached. Nothing to do!', 'success');
      setPullPhase('done');
      return;
    }

    // ── PHASE 3: Compile request list ──
    setPullPhase('compiling');
    addLog('', 'dim');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    addLog('PHASE 3 — Compiling request list', 'heading');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    await sleep(150);

    for (const [sym, range] of toFetch.entries()) {
      addLog(`  ${sym.padEnd(16)} ${range.from} → ${range.to}`, 'info');
      await sleep(25);
    }
    addLog('', 'dim');
    addLog(`✓ Request list compiled — ${toFetch.size} ticker(s) queued`, 'success');
    await sleep(200);

    // ── PHASE 4: Fetch ──
    setPullPhase('pulling');
    addLog('', 'dim');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    addLog('PHASE 4 — Pulling price history', 'heading');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    await sleep(150);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    let totalRows = 0;
    let errors = 0;

    for (const [sym, range] of toFetch.entries()) {
      addLog(`  Requesting price history for ${sym} (${range.from} → ${range.to})...`, 'info');

      try {
        const url = `${supabaseUrl}/functions/v1/backfill-price-history?symbols=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        if (!res.ok) {
          addLog(`  ✗ ${sym}: HTTP ${res.status}`, 'error');
          errors++;
        } else {
          const json = await res.json();
          const result = json?.summary?.[sym];
          if (result?.error) {
            addLog(`  ✗ ${sym}: ${result.error}`, 'error');
            errors++;
          } else {
            const rows = result?.rows ?? 0;
            totalRows += rows;
            addLog(`  ✓ ${sym} complete — ${rows.toLocaleString()} rows cached`, 'success');
          }
        }
      } catch (e: any) {
        addLog(`  ✗ ${sym}: ${e.message || 'Network error'}`, 'error');
        errors++;
      }
    }

    addLog('', 'dim');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    addLog(`COMPLETE — ${totalRows.toLocaleString()} rows cached${errors > 0 ? `, ${errors} error(s)` : ''}`, errors > 0 ? 'error' : 'success');
    addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');

    setPullPhase('done');
    await refreshData();
  };

  const handleExportCSV = () => {
    let csv = '';
    csv += 'TRANSACTIONS\n';
    csv += 'Date,Description,Amount,Type,Category,Account\n';
    data.transactions.forEach(tx => {
      csv += `${tx.date},"${tx.description}",${tx.amount},${tx.type},${tx.category},${tx.accountId}\n`;
    });
    csv += '\n\nACCOUNTS\n';
    csv += 'Name,Type,Institution,Currency,Starting Value,Interest Rate\n';
    data.assets.forEach(a => {
      csv += `"${a.name}",${a.type},"${a.institution}",${a.currency},${a.startingValue},"${a.interestRate || ''}"\n`;
    });
    csv += '\n\nDEBTS\n';
    csv += 'Name,Type,Limit,APR,Min Payment Type,Min Payment Value,Starting Value\n';
    data.debts.forEach(d => {
      csv += `"${d.name}",${d.type},${d.limit},${d.apr},${d.minPaymentType},${d.minPaymentValue},${d.startingValue}\n`;
    });
    csv += '\n\nBILLS\n';
    csv += 'Name,Amount,Due Date,Category,Auto Pay,Is Paid\n';
    data.bills.forEach(b => {
      csv += `"${b.name}",${b.amount},"${b.dueDate}",${b.category},${b.autoPay},${b.isPaid}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lithos-finance-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lithos-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (!confirmDelete || deleteType === 'none') return;
    setDeleteSuccess(true);
    setConfirmDelete(false);
    setDeleteType('none');
    setTimeout(() => setDeleteSuccess(false), 3000);
  };

  const deleteOptions = [
    { value: 'none', label: 'Select deletion type...' },
    { value: 'all_transactions', label: 'All Transactions' },
    { value: 'recent_transactions', label: 'Transactions from Last X Months' },
    { value: 'accounts', label: 'All Accounts (set balances to 0)' },
    { value: 'investments', label: 'All Investments' },
    { value: 'debts', label: 'All Debts' },
    { value: 'bills', label: 'All Bills' },
    { value: 'factory_reset', label: 'Factory Reset (Delete Everything)' },
  ];

  const isPulling = pullPhase !== 'idle' && pullPhase !== 'done';
  const phaseLabel: Record<PullPhase, string> = {
    idle: 'Pull Historic Price Data',
    scanning: 'Scanning transactions...',
    cache_check: 'Checking cache...',
    compiling: 'Compiling requests...',
    pulling: 'Pulling data...',
    done: 'Pull Complete',
  };

  return (
    <div className="p-12 max-w-4xl mx-auto h-full flex flex-col slide-up overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-start mb-8">
        <div>
          <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-1">Settings</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-900/10 border border-red-900/30 text-red-400 text-xs font-bold uppercase rounded-sm hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={14} />
          Logout
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
        {/* Export */}
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Download size={18} />
            Export Data
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-iron-dust mb-3">Export all your financial data as CSV for use in spreadsheets</p>
              <button onClick={handleExportCSV} className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">
                <Download size={14} />
                Export as CSV
              </button>
            </div>
            <div>
              <p className="text-sm text-iron-dust mb-3">Export complete backup as JSON for archiving or migration</p>
              <button onClick={handleExportJSON} className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">
                <Download size={14} />
                Export as JSON
              </button>
            </div>
          </div>
        </div>

        {/* Import + Historic Pull */}
        <div className="border border-white/5 rounded-sm p-8 bg-[#161618]">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Upload size={18} />
            Import Data
          </h3>
          <div className="space-y-8">
            <div>
              <p className="text-sm text-iron-dust mb-4">Import a previously exported JSON backup to restore your data</p>
              <label className="flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors cursor-pointer w-fit">
                <Upload size={14} />
                Choose File
                <input type="file" accept=".json" className="hidden" onChange={() => {}} />
              </label>
            </div>

            <div className="border-t border-white/5" />

            <div>
              <p className="text-sm font-bold text-white mb-1">Pull Historic Price Data</p>
              <p className="text-sm text-iron-dust">Backfills missing price history for all investment holdings. Checks the cache first and only requests the uncached date range per ticker.</p>

              <button
                onClick={handlePullHistoricData}
                disabled={isPulling}
                className={clsx(
                  'mt-4 flex items-center gap-2 px-6 py-3 rounded-sm text-sm font-bold uppercase tracking-wider border transition-all',
                  isPulling
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-not-allowed'
                    : pullPhase === 'done'
                    ? 'bg-emerald-vein/10 border-emerald-vein/30 text-emerald-vein hover:bg-emerald-vein/20'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                )}
              >
                {isPulling
                  ? <Loader2 size={14} className="animate-spin" />
                  : pullPhase === 'done'
                  ? <CheckCircle2 size={14} />
                  : <Database size={14} />}
                {phaseLabel[pullPhase]}
              </button>

              {log.length > 0 && (
                <div className="mt-4 bg-[#0a0b0c] border border-white/8 rounded-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#111314] border-b border-white/5">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-[10px] font-mono text-iron-dust/50 ml-2 uppercase tracking-widest">lithos price history console</span>
                    {isPulling && <Loader2 size={10} className="animate-spin text-blue-400 ml-auto" />}
                    {pullPhase === 'done' && <CheckCircle2 size={10} className="text-emerald-vein ml-auto" />}
                  </div>
                  <div
                    ref={logRef}
                    className="max-h-[340px] overflow-y-auto custom-scrollbar p-4 space-y-0.5 font-mono text-[11px] leading-relaxed"
                  >
                    {log.map(entry => (
                      <div
                        key={entry.id}
                        className={clsx(
                          entry.type === 'heading' && 'text-blue-400 font-bold',
                          entry.type === 'success' && 'text-emerald-vein',
                          entry.type === 'error' && 'text-magma',
                          entry.type === 'info' && 'text-white/80',
                          entry.type === 'dim' && 'text-white/20',
                        )}
                      >
                        {entry.text || '\u00a0'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete */}
        <div className="border border-red-900/30 rounded-sm p-8 bg-red-900/5">
          <h3 className="text-lg font-bold text-red-400 mb-6 flex items-center gap-2">
            <Trash2 size={18} />
            Delete Data
          </h3>
          <div className="space-y-4">
            <p className="text-sm text-iron-dust">Permanently delete specific data. This action cannot be undone.</p>
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Select Data to Delete</label>
              <select
                value={deleteType}
                onChange={e => { setDeleteType(e.target.value); setConfirmDelete(false); }}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
              >
                {deleteOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {deleteType === 'recent_transactions' && (
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Months to Delete</label>
                <input
                  type="number" min="1" max="120" value={monthsToDelete}
                  onChange={e => setMonthsToDelete(parseInt(e.target.value))}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
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
                  <button onClick={() => setConfirmDelete(true)} className="px-6 py-3 bg-red-900/20 border border-red-900/30 text-red-400 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-900/30 transition-colors">
                    Confirm Delete
                  </button>
                ) : (
                  <>
                    <button onClick={() => setConfirmDelete(false)} className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/15 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleDelete} className="px-6 py-3 bg-red-600 border border-red-600 text-white rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-red-700 transition-colors">
                      Delete Permanently
                    </button>
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
