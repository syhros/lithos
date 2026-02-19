import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  isRead: boolean;
}

const initialNotifications: Notification[] = [
  { id: 1, title: 'Transaction Categorized', message: 'Your transaction at Waitrose has been auto-categorized.', time: '2 hours ago', isRead: false },
  { id: 2, title: 'Portfolio Update', message: 'Your portfolio increased by 2.3% this week.', time: '1 day ago', isRead: false },
  { id: 3, title: 'Bill Reminder', message: 'Your electricity bill is due in 3 days.', time: '2 days ago', isRead: false },
  { id: 4, title: 'Dividend Received', message: 'You received £45 in dividends from VUSA.', time: '3 days ago', isRead: false },
  { id: 5, title: 'Account Updated', message: 'Your savings account interest has been applied.', time: '1 week ago', isRead: true },
];

export const NotificationModal: React.FC<NotificationModalProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md p-0 shadow-2xl overflow-hidden rounded-sm relative slide-up flex flex-col max-h-[600px]">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-magma text-black text-[10px] font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-0 overflow-y-auto custom-scrollbar flex-1">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 border-b border-white/5 hover:bg-white/[0.02] flex gap-4 transition-colors ${
                !notification.isRead ? 'bg-white/[0.02]' : ''
              }`}
            >
              <div className="mt-1 text-emerald-vein flex-shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold mb-1 ${notification.isRead ? 'text-iron-dust' : 'text-white'}`}>
                  {notification.title}
                </p>
                <p className="text-[10px] font-mono text-iron-dust">{notification.message}</p>
                <p className="text-[9px] text-iron-dust mt-2 opacity-50">{notification.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-[#131517] text-center border-t border-white/5 flex-shrink-0">
          <button
            onClick={handleMarkAllAsRead}
            className="text-[10px] font-mono uppercase tracking-wider text-magma hover:text-white transition-colors"
          >
            Mark all as read
          </button>
        </div>
      </div>
    </div>
  );
};