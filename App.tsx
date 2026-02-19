
import React from 'react';
import { X, User, Check } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { clsx } from 'clsx';
import { Currency } from '../data/mockData';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR'];

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { data, updateUserProfile } = useFinance();
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md p-0 shadow-2xl overflow-hidden rounded-sm relative slide-up">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517]">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">User Profile</h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-8 flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-slate flex items-center justify-center border-2 border-white/10 text-white mb-4">
            <User size={32} />
          </div>
          <h2 className="text-xl font-bold text-white">{data.user.username}</h2>
          <p className="text-xs text-iron-dust font-mono mt-1 mb-8">Premium Member</p>
          
          <div className="w-full space-y-6">
            
            {/* Currency Selector */}
            <div>
                 <span className="text-[10px] text-iron-dust uppercase tracking-[2px] block mb-3 font-bold">Preferred Currency</span>
                 <div className="grid grid-cols-3 gap-3">
                    {CURRENCIES.map((curr) => {
                        const isSelected = data.user.currency === curr;
                        return (
                            <button
                                key={curr}
                                onClick={() => updateUserProfile({ currency: curr })}
                                className={clsx(
                                    "relative h-12 rounded-sm border flex items-center justify-center transition-all duration-300 group overflow-hidden",
                                    isSelected 
                                        ? "bg-magma/10 border-magma shadow-[0_0_15px_rgba(255,77,0,0.15)]" 
                                        : "bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10"
                                )}
                            >
                                <span className={clsx(
                                    "text-xs font-mono font-bold transition-colors",
                                    isSelected ? "text-magma" : "text-iron-dust group-hover:text-white"
                                )}>
                                    {curr}
                                </span>
                                {isSelected && (
                                    <div className="absolute top-1 right-1">
                                        <Check size={10} className="text-magma" />
                                    </div>
                                )}
                            </button>
                        )
                    })}
                 </div>
            </div>

            {/* Plan Info */}
            <div className="flex justify-between p-4 bg-[#131517] border border-white/5 rounded-sm">
              <span className="text-xs text-iron-dust uppercase tracking-wider font-bold">Current Plan</span>
              <span className="text-xs text-emerald-vein font-bold uppercase tracking-wider">Tectonic Pro</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
