import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronDown, Trash2 } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Bill } from '../data/mockData';
import { clsx } from 'clsx';
import { CustomSelect, SelectGroup } from './CustomSelect';

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  billToEdit?: Bill;
}

const DEFAULT_CATEGORIES = ['Utilities', 'Insurance', 'Subscriptions', 'Rent', 'Loan', 'Medical', 'Housing', 'Software', 'Other'];

const FREQUENCY_OPTIONS: SelectGroup[] = [
  {
    options: [
      { value: 'weekly',  label: 'Weekly',  hint: 'every week' },
      { value: 'monthly', label: 'Monthly', hint: 'every month' },
      { value: 'yearly',  label: 'Yearly',  hint: 'once a year' },
    ],
  },
];

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
  // yearly-specific: day (1-31) and month (1-12)
  const [yearlyDay,   setYearlyDay]   = useState('');
  const [yearlyMonth, setYearlyMonth] = useState('');
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
    setYearlyDay('');
    setYearlyMonth('');
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
      const freq = billToEdit.frequency || 'monthly';
      setIsRecurring(billToEdit.isRecurring || false);
      setFrequency(freq);
      setRecurringEndDate(billToEdit.recurringEndDate || '');
      setAutoPay(billToEdit.autoPay);
      setCategory(billToEdit.category);
      setCategoryInput('');
      // Populate due date fields
      if (freq === 'yearly' && billToEdit.dueDate) {
        // stored as "DD/MM" or "YYYY-MM-DD" — handle both
        if (billToEdit.dueDate.includes('-') && billToEdit.dueDate.length === 10) {
          const parts = billToEdit.dueDate.split('-');
          setYearlyDay(parts[2]);
          setYearlyMonth(parts[1]);
        } else if (billToEdit.dueDate.includes('/')) {
          const parts = billToEdit.dueDate.split('/');
          setYearlyDay(parts[0]);
          setYearlyMonth(parts[1]);
        } else {
          setDueDate(billToEdit.dueDate);
        }
      } else {
        setDueDate(billToEdit.dueDate);
      }
    } else if (!isOpen) {
      resetForm();
    }
  }, [isEditing, billToEdit, isOpen, resetForm]);

  if (!isOpen) return null;

  // Compute the final dueDate string to save
  const computedDueDate = (): string => {
    if (isRecurring && frequency === 'yearly') {
      if (yearlyDay && yearlyMonth) return `${yearlyDay.padStart(2,'0')}/${yearlyMonth.padStart(2,'0')}`;
      return '';
    }
    return dueDate;
  };

  const handleSave = () => {
    const finalCategory = categoryInput || category;
    const finalDueDate = computedDueDate();
    if (!name || !amount || !finalDueDate || !finalCategory) return;

    const billData = {
      name,
      amount: parseFloat(amount),
      dueDate: finalDueDate,
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

  const dueDateLabel = () => {
    if (!isRecurring) return 'Due Date';
    if (frequency === 'weekly')  return 'Day of Week';
    if (frequency === 'monthly') return 'Day of Month (1–31)';
    return 'Due Day & Month';
  };

  const isSaveDisabled = () => {
    const finalCategory = categoryInput || category;
    if (!name || !amount || !finalCategory) return true;
    if (isRecurring && frequency === 'yearly') return !yearlyDay || !yearlyMonth;
    return !dueDate;
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

          {/* Category — custom dropdown, max 5 visible rows */}
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
                <div
                  className="absolute top-full left-0 right-0 mt-1 bg-[#1a1c1e] border border-white/10 rounded-sm shadow-xl z-10 overflow-y-auto custom-scrollbar"
                  style={{ maxHeight: '5 * 2.5rem', height: 'auto' }}
                >
                  {/* Inline style caps the list at 5 rows (each ~40px = 10rem) */}
                  <div style={{ maxHeight: '12.5rem', overflowY: 'auto' }}>
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
                {dueDateLabel()}
              </label>

              {/* Weekly: day-of-week select */}
              {isRecurring && frequency === 'weekly' ? (
                <select
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                >
                  <option value="">Select day</option>
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                    <option key={d} value={d.toLowerCase()}>{d}</option>
                  ))}
                </select>

              /* Monthly: numeric day */
              ) : isRecurring && frequency === 'monthly' ? (
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  placeholder="1–31"
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />

              /* Yearly: two small inputs DD / MM */
              ) : isRecurring && frequency === 'yearly' ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={yearlyDay}
                      onChange={e => setYearlyDay(e.target.value)}
                      placeholder="DD"
                      className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono text-center"
                    />
                    <p className="text-[9px] text-iron-dust/50 font-mono text-center mt-1">Day</p>
                  </div>
                  <span className="text-iron-dust self-center">/</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={yearlyMonth}
                      onChange={e => setYearlyMonth(e.target.value)}
                      placeholder="MM"
                      className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono text-center"
                    />
                    <p className="text-[9px] text-iron-dust/50 font-mono text-center mt-1">Month</p>
                  </div>
                </div>

              /* Non-recurring or default: full date */
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
                  <CustomSelect
                    value={frequency}
                    onChange={v => setFrequency(v as 'weekly' | 'monthly' | 'yearly')}
                    groups={FREQUENCY_OPTIONS}
                    placeholder="Select frequency..."
                  />
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
              disabled={isSaveDisabled()}
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
