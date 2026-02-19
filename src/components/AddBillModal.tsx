import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Bill } from '../data/mockData';
import { clsx } from 'clsx';

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  billToEdit?: Bill;
}

const CATEGORIES = ['Utilities', 'Insurance', 'Subscriptions', 'Rent', 'Loan', 'Medical', 'Other'];

export const AddBillModal: React.FC<AddBillModalProps> = ({
  isOpen,
  onClose,
  billToEdit,
}) => {
  const { addBill, updateBill } = useFinance();
  const isEditing = !!billToEdit;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('Other');
  const [autoPay, setAutoPay] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setAmount('');
    setDueDate('');
    setCategory('Other');
    setAutoPay(false);
    setIsPaid(false);
  }, []);

  useEffect(() => {
    if (isEditing && billToEdit) {
      setName(billToEdit.name);
      setAmount(billToEdit.amount.toString());
      setDueDate(billToEdit.dueDate);
      setCategory(billToEdit.category);
      setAutoPay(billToEdit.autoPay);
      setIsPaid(billToEdit.isPaid);
    } else if (!isOpen) {
      resetForm();
    }
  }, [isEditing, billToEdit, isOpen, resetForm]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name || !amount || !dueDate) return;

    const billData = {
      name,
      amount: parseFloat(amount),
      dueDate,
      category,
      autoPay,
      isPaid,
    };

    if (isEditing && billToEdit) {
      updateBill(billToEdit.id, billData);
    } else {
      addBill(billData);
    }

    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md rounded-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517] flex-shrink-0">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">
            {isEditing ? 'Edit Bill' : 'Add Bill'}
          </h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar">
          <div>
            <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
              Bill Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Electric Bill"
              className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-iron-dust text-xs">£</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
              />
            </div>
          </div>

          <div className="border border-white/5 rounded-sm p-4 bg-black/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">Auto-Pay Enabled</span>
              <button
                onClick={() => setAutoPay(a => !a)}
                className={clsx(
                  'w-10 h-5 rounded-full transition-all relative',
                  autoPay ? 'bg-emerald-vein' : 'bg-white/10'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                  autoPay ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">Mark as Paid</span>
              <button
                onClick={() => setIsPaid(p => !p)}
                className={clsx(
                  'w-10 h-5 rounded-full transition-all relative',
                  isPaid ? 'bg-emerald-vein' : 'bg-white/10'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                  isPaid ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name || !amount || !dueDate}
            className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
