import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md p-0 shadow-2xl overflow-hidden rounded-sm relative slide-up">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517]">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Notifications</h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-0 max-h-[400px] overflow-y-auto">
          {[1, 2, 3, 4, 5].map((_, i) => (
            <div key={i} className="p-4 border-b border-white/5 hover:bg-white/[0.02] flex gap-4">
              <div className="mt-1 text-emerald-vein"><CheckCircle2 size={16} /></div>
              <div>
                <p className="text-xs font-bold text-white mb-1">Transaction Categorized</p>
                <p className="text-[10px] font-mono text-iron-dust">Your transaction at Waitrose has been auto-categorized.</p>
                <p className="text-[9px] text-iron-dust mt-2 opacity-50">2 hours ago</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-[#131517] text-center">
          <button className="text-[10px] font-mono uppercase tracking-wider text-magma hover:underline">Mark all as read</button>
        </div>
      </div>
    </div>
  );
};