import React from 'react';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md p-8 rounded-sm shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-6">Add New Account</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-iron-dust mb-2">Account Name</label>
            <input type="text" className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none" placeholder="e.g. Barclays Current" />
          </div>
          <div>
            <label className="block text-xs font-mono text-iron-dust mb-2">Type</label>
            <select className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none">
              <option>Checking</option>
              <option>Savings</option>
            </select>
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={onClose} className="flex-1 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5">Cancel</button>
            <button onClick={onClose} className="flex-1 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};