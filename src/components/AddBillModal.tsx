import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronDown, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Bill } from '../data/mockData';
import { clsx } from 'clsx';

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  billToEdit?: Bill;
}

const DEFAULT_CATEGORIES = ['Utilities', 'Insurance', 'Subscriptions', 'Rent', 'Loan', 'Medical', 'Housing', 'Software', 'Other'];

export const AddBillModal: React.FC<AddBillModalProps> = ({
  isOpen,
  onClose,
  billToEdit,
}) => {
  const { data, addBill, updateBill, deleteBill } = useFinance();
  const isEditing = !!billToEdit;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [autoPay, setAutoPay] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const existingCategories = useMemo(() => {
    const cats = new Set(DEFAULT_CATEGORIES);
    data.bills.forEach(bill => {
      if (bill.category) cats.add(bill.category);
    });
    return Array.from(cats).sort();
  }, [data.bills]);

  const filteredCategories = useMemo(() => {
    const input = categoryInput.toLowerCase();
    return existingCategories.filter(cat => cat.toLowerCase().includes(input));
  }, [categoryInput, existingCategories]);

  const resetForm = useCallback(() => {
    setName('');
    setAmount('');
    setDueDate('');
    setCategory('');
    setCategoryInput('');
    setIsRecurring(false);
    setFrequency('monthly');
    setRecurringEndDate('');
    setAutoPay(false);
    setShowCategoryDropdown(false);
  }, []);

  useEffect(() => {
    if (isEditing && billToEdit) {
      setName(billToEdit.name);
      setAmount(billToEdit.amount.toString());
      setDueDate(billToEdit.dueDate);
      setCategory(billToEdit.category);
      setCategoryInput('');
      setIsRecurring(billToEdit.isRecurring || false);
      setFrequency(billToEdit.frequency || 'monthly');
      setRecurringEndDate(billToEdit.recurringEndDate || '');
      setAutoPay(billToEdit.autoPay);
    } else if (!isOpen) {
      resetForm();
    }
  }, [isEditing, billToEdit, isOpen, resetForm]);

  if (!isOpen) return null;

  const handleSave = () => {
    const finalCategory = categoryInput || category;
    if (!name || !amount || !dueDate || !finalCategory) return;

    const billData = {
      name,
      amount: parseFloat(amount),
      dueDate,
      category: finalCategory,
      autoPay,
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
      recurringEndDate: isRecurring && recurringEndDate ? recurringEndDate : undefined,
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

          <div className="relative">
            <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
              Category
            </label>
            <div className="relative">
              <input
                type="text"
                value={categoryInput || category}
                onChange={e => {
                  setCategoryInput(e.target.value);
                  setShowCategoryDropdown(true);
                }}
                onFocus={() => setShowCategoryDropdown(true)}
                placeholder="Select or type category"
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none pr-8"
              />
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-iron-dust pointer-events-none" />

              {showCategoryDropdown && filteredCategories.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1c1e] border border-white/10 rounded-sm shadow-xl z-10">
                  {filteredCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setCategoryInput('');
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                {isRecurring ? (
                  frequency === 'weekly' ? 'Day of Week' : frequency === 'monthly' ? 'Day of Month' : 'Due Date'
                ) : 'Due Date'}
              </label>
              {isRecurring && frequency === 'weekly' ? (
                <select
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                >
                  <option value="">Select day</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
              ) : isRecurring && frequency === 'monthly' ? (
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  placeholder="1-31"
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              ) : (
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              )}
            </div>
          </div>

          <div className="border border-white/5 rounded-sm p-4 bg-black/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-iron-dust uppercase tracking-[2px]">Recurring Bill</span>
              <button
                onClick={() => setIsRecurring(r => !r)}
                className={clsx(
                  'w-10 h-5 rounded-full transition-all relative',
                  isRecurring ? 'bg-emerald-vein' : 'bg-white/10'
                )}
              >
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                  isRecurring ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            {isRecurring && (
              <>
                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                    Frequency
                  </label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as 'weekly' | 'monthly' | 'yearly')}
                    className="w-full bg-black/20 border border-white/10 p-2.5 text-sm text-white rounded-sm focus:border-magma outline-none"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={e => setRecurringEndDate(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 p-2.5 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
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
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-between gap-3 flex-shrink-0">
          {isEditing && billToEdit && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this bill?')) {
                  deleteBill(billToEdit.id);
                  resetForm();
                  onClose();
                }
              }}
              className="flex items-center gap-2 px-5 py-3 bg-red-900/10 border border-red-900/30 text-red-400 text-xs font-bold uppercase rounded-sm hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={() => { resetForm(); onClose(); }}
              className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name || !amount || !dueDate || !(categoryInput || category)}
              className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
