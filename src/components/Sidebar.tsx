import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { NotificationModal } from './NotificationModal';
import { ProfileModal } from './ProfileModal';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import {
    LayoutDashboard,
    ArrowRightLeft,
    Wallet,
    CreditCard,
    Target,
    Receipt,
    RefreshCcw,
    TrendingUp,
    Tag,
    Settings,
    Bell,
    User,
    LineChart as LineChartIcon
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: ArrowRightLeft },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/investments', label: 'Investments', icon: LineChartIcon },
  { path: '/debts', label: 'Debts', icon: CreditCard },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/bills', label: 'Bills', icon: Receipt },
  { path: '/recurring', label: 'Recurring', icon: RefreshCcw },
  { path: '/trends', label: 'Trends', icon: TrendingUp },
  { path: '/categorize', label: 'Categorize', icon: Tag },
];

export const Sidebar: React.FC = () => {
  const { data, gbpUsdRate, rateUpdatedAt } = useFinance();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const fxChartData = useMemo(() => {
    const data = [];
    for (let i = 0; i < 20; i++) {
      const variance = (Math.random() - 0.5) * 0.02;
      data.push({
        value: gbpUsdRate * (1 + variance)
      });
    }
    return data;
  }, [gbpUsdRate]);

  const dailyChange = useMemo(() => {
    if (fxChartData.length < 2) return 0;
    const first = fxChartData[0].value;
    const last = fxChartData[fxChartData.length - 1].value;
    return ((last - first) / first) * 100;
  }, [fxChartData]);

  const formatUpdateTime = (updatedAt: string) => {
    if (!updatedAt) return '';
    try {
      const date = new Date(updatedAt);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  return (
    <>
      <aside className="strata-panel h-full flex flex-col z-40 relative px-4 py-8 bg-[#0a0a0c] border-r border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-4 mb-14 px-4">
          <div className="w-6 h-6 bg-magma" style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}></div>
          <span className="text-xl font-black tracking-[6px] uppercase text-white font-sans">LITHOS</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => clsx(
                "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-300 group",
                isActive 
                  ? "bg-white/5 text-white" 
                  : "text-iron-dust hover:text-white hover:bg-white/[0.02]"
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} className={isActive ? "text-magma" : "text-iron-dust group-hover:text-white"} />
                  <span className="text-[11px] font-bold uppercase tracking-[2px]">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Exchange Rate Display */}
        {gbpUsdRate > 0 && (
          <div className="mt-6 pb-6 px-4 border-b border-white/5">
            <div className="bg-[#161618] border border-white/5 rounded-sm p-4 relative overflow-hidden group hover:border-white/10 transition-colors">
              {/* Gradient background accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              {/* Header */}
              <div className="relative z-10 mb-3">
                <div className="text-[8px] text-iron-dust uppercase tracking-[2px] font-bold mb-2">MARKET LAYER / FX-GBP-01</div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[9px] text-iron-dust uppercase tracking-widest mb-1">GBP / USD</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white tracking-tight">${gbpUsdRate.toFixed(2)}</span>
                      <span className="text-sm font-bold text-blue-400">{(gbpUsdRate % 1).toFixed(3).slice(1)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={clsx('text-[10px] font-bold uppercase tracking-widest mb-1', dailyChange >= 0 ? 'text-emerald-vein' : 'text-magma')}>
                      {dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)}%
                    </div>
                    <div className="text-[9px] font-mono text-blue-400 uppercase tracking-widest">LIVE</div>
                  </div>
                </div>
              </div>

              {/* Mini Chart */}
              <div className="relative z-10 h-[32px] -mx-4 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fxChartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <YAxis hide domain={['dataMin - 0.01', 'dataMax + 0.01']} />
                    <Line
                      type="natural"
                      dataKey="value"
                      stroke={dailyChange >= 0 ? '#00f2ad' : '#ff6b5b'}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Footer Stats */}
              <div className="relative z-10 grid grid-cols-2 gap-3 text-[9px]">
                <div>
                  <div className="text-iron-dust uppercase tracking-widest mb-1">BID PRICE</div>
                  <div className="font-mono text-white font-bold">{(gbpUsdRate - 0.0001).toFixed(5)}</div>
                </div>
                <div className="text-right">
                  <div className="text-iron-dust uppercase tracking-widest mb-1">ASK PRICE</div>
                  <div className="font-mono text-white font-bold">{(gbpUsdRate + 0.0001).toFixed(5)}</div>
                </div>
              </div>

              {/* Update time */}
              <div className="relative z-10 mt-3 text-[8px] text-iron-dust">
                Updated {formatUpdateTime(rateUpdatedAt)}
              </div>
            </div>
          </div>
        )}

        {/* User Profile Footer (Restored Layout) */}
        <div className="mt-6 pt-6 border-t border-white/5 px-4">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate flex items-center justify-center border border-white/10 text-white">
                        <User size={14} />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-white leading-tight">{data.user.username}</div>
                        <button 
                            onClick={() => setShowProfile(true)}
                            className="text-[9px] text-iron-dust hover:text-magma uppercase tracking-wider transition-colors text-left"
                        >
                            View Profile
                        </button>
                    </div>
                </div>
                
                {/* Notification Bell */}
                <button 
                    onClick={() => setShowNotifications(true)}
                    className="relative text-iron-dust hover:text-white transition-colors"
                >
                    <Bell size={16} />
                    {data.user.notifications > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-magma rounded-full shadow-sm"></span>
                    )}
                </button>
             </div>
             
             <div className="mt-4">
                <NavLink
                to="/settings"
                className="flex items-center gap-3 text-iron-dust hover:text-white transition-colors"
                >
                    <Settings size={14} />
                    <span className="text-[9px] font-bold uppercase tracking-[2px]">Settings</span>
                </NavLink>
             </div>
        </div>
      </aside>

      <NotificationModal isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </>
  );
};