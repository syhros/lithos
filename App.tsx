import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FinanceProvider } from './src/context/FinanceContext';
import { Sidebar } from './src/components/Sidebar';
import { Dashboard } from './src/pages/Dashboard';
import { Transactions } from './src/pages/Transactions';
import { Accounts } from './src/pages/Accounts';
import { Debts } from './src/pages/Debts';
import { Investments } from './src/pages/Investments';
import { Bills } from './src/pages/Bills';
import { Trends } from './src/pages/Trends';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    // Tectonic Grid Layout: Sidebar | Content
    // We use a gap of 2px with a slate background to create the "fissure" look between panels
    <div className="grid grid-cols-[280px_1fr] h-screen w-full bg-slate gap-[2px] p-[2px] overflow-hidden">
      <Sidebar />
      
      <main className="strata-panel relative h-full overflow-hidden flex flex-col bg-gradient-to-b from-[#131517] to-shale">
        {/* Children content area */}
        <div className="flex-1 min-h-0">
            {children}
        </div>
      </main>
    </div>
  );
};

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="p-16 max-w-7xl mx-auto h-full slide-up overflow-y-auto custom-scrollbar">
    <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">Module</span>
    <h1 className="text-4xl font-bold text-white tracking-tight mb-4">{title}</h1>
    <div className="mt-12 border border-dashed border-white/10 rounded-sm h-64 flex items-center justify-center text-iron-dust font-mono text-xs bg-quartz uppercase tracking-widest">
      [ Construction: {title} ]
    </div>
  </div>
);

const App: React.FC = () => {
  return (
    <FinanceProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/debts" element={<Debts />} />
            <Route path="/goals" element={<PlaceholderPage title="Goals" />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/recurring" element={<PlaceholderPage title="Recurring" />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/categorize" element={<PlaceholderPage title="Categorize" />} />
            <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </FinanceProvider>
  );
};

export default App;