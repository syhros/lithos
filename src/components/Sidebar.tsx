import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useFinance } from '../context/FinanceContext';
import { NotificationModal } from './NotificationModal';
import { ProfileModal } from './ProfileModal';
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
    LineChart
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: ArrowRightLeft },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/investments', label: 'Investments', icon: LineChart },
  { path: '/debts', label: 'Debts', icon: CreditCard },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/bills', label: 'Bills', icon: Receipt },
  { path: '/recurring', label: 'Recurring', icon: RefreshCcw },
  { path: '/trends', label: 'Trends', icon: TrendingUp },
  { path: '/categorize', label: 'Categorize', icon: Tag },
];

export const Sidebar: React.FC = () => {
  const { data } = useFinance();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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

        {/* User Profile Footer (Restored Layout) */}
        <div className="mt-8 pt-6 border-t border-white/5 px-4">
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