import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { AssetType, Currency, DebtType } from '../data/mockData';
import { clsx } from 'clsx';

type ModalMode = 'asset' | 'debt';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: AssetType;
  mode?: ModalMode;
}

const COLORS = ['#00f2ad', '#d4af37', '#3b82f6', '#f97316', '#e85d04', '#ec4899', '#14b8a6'];

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'checking',
  mode = 'asset',
}) => {
  const { addAccount, addDebt, currencySymbol } = useFinance();

  const [assetType, setAssetType] = useState<AssetType>(defaultType);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [startingValue, setStartingValue] = useState('');
  const [currency, setCurrency] = useState<Currency>('GBP');
  const [color, setColor] = useState(COLORS[0]);
  const [interestRate, setInterestRate] = useState('');

  const [debtType, setDebtType] = useState<DebtType>('credit_card');
  const [debtLimit, setDebtLimit] = useState('');
  const [debtApr, setDebtApr] = useState('');
  const [debtMinPayment, setDebtMinPayment] = useState('');
  const [debtStarting, setDebtStarting] = useState('');

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setInstitution('');
    setStartingValue('');
    setCurrency('GBP');
    setColor(COLORS[0]);
    setInterestRate('');
    setDebtType('credit_card');
    setDebtLimit('');
    setDebtApr('');
    setDebtMinPayment('');
    setDebtStarting('');
  };

  const handleSave = () => {
    if (!name) return;

    if (mode === 'debt') {
      if (!debtLimit || !debtApr) return;
      addDebt({
        name,
        type: debtType,
        limit: parseFloat(debtLimit),
        apr: parseFloat(debtApr),
        minPayment: parseFloat(debtMinPayment) || 0,
        startingValue: parseFloat(debtStarting) || 0,
      });
    } else {
      addAccount({
        name,
        type: assetType,
        currency,
        institution,
        color,
        startingValue: parseFloat(startingValue) || 0,
        interestRate: assetType === 'savings' && interestRate ? parseFloat(interestRate) : undefined,
      });
    }

    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#1a1c1e] border border-white/10 w-full max-w-md rounded-sm shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#131517]">
          <h3 className="text-sm font-bold uppercase tracking-[2px] text-white">
            {mode === 'debt' ? 'Add Debt Account' : 'Add Account'}
          </h3>
          <button onClick={onClose} className="text-iron-dust hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-8 space-y-5">
          {mode === 'asset' && (
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Account Type</label>
              <div className="grid grid-cols-3 gap-3">
                {(['checking', 'savings', 'investment'] as AssetType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setAssetType(t)}
                    className={clsx(
                      'h-10 rounded-sm border text-xs font-mono font-bold uppercase tracking-wider transition-all',
                      assetType === t
                        ? 'bg-magma/10 border-magma text-magma'
                        : 'bg-white/5 border-white/5 text-iron-dust hover:border-white/20 hover:text-white'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'debt' && (
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Debt Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(['credit_card', 'loan'] as DebtType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setDebtType(t)}
                    className={clsx(
                      'h-10 rounded-sm border text-xs font-mono font-bold uppercase tracking-wider transition-all',
                      debtType === t
                        ? 'bg-magma/10 border-magma text-magma'
                        : 'bg-white/5 border-white/5 text-iron-dust hover:border-white/20 hover:text-white'
                    )}
                  >
                    {t.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
              {mode === 'debt' ? 'Debt Name' : 'Account Name'}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={mode === 'debt' ? 'e.g. Amex Gold' : 'e.g. Barclays Current'}
              className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
            />
          </div>

          {mode === 'asset' && (
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Institution</label>
              <input
                type="text"
                value={institution}
                onChange={e => setInstitution(e.target.value)}
                placeholder="e.g. Barclays"
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">
                {mode === 'debt' ? 'Current Balance' : 'Starting Balance'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                <input
                  type="number"
                  value={mode === 'debt' ? debtStarting : startingValue}
                  onChange={e => mode === 'debt' ? setDebtStarting(e.target.value) : setStartingValue(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              </div>
            </div>

            {mode === 'asset' && (
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value as Currency)}
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none"
                >
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            )}

            {mode === 'debt' && (
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Credit Limit</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                  <input
                    type="number"
                    value={debtLimit}
                    onChange={e => setDebtLimit(e.target.value)}
                    placeholder="0"
                    className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {mode === 'debt' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">APR (%)</label>
                <input
                  type="number"
                  value={debtApr}
                  onChange={e => setDebtApr(e.target.value)}
                  placeholder="e.g. 28.9"
                  step="0.1"
                  className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Min Payment</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-iron-dust text-xs">{currencySymbol}</span>
                  <input
                    type="number"
                    value={debtMinPayment}
                    onChange={e => setDebtMinPayment(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-black/20 border border-white/10 p-3 pl-6 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {mode === 'asset' && assetType === 'savings' && (
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-2">Annual Interest Rate (%)</label>
              <input
                type="number"
                value={interestRate}
                onChange={e => setInterestRate(e.target.value)}
                placeholder="e.g. 5.1"
                step="0.01"
                className="w-full bg-black/20 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-magma outline-none font-mono"
              />
            </div>
          )}

          {mode === 'asset' && (
            <div>
              <label className="block text-[10px] font-mono text-iron-dust uppercase tracking-[2px] mb-3">Accent Color</label>
              <div className="flex gap-3">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={clsx(
                      'w-7 h-7 rounded-full transition-all',
                      color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1a1c1e] scale-110' : 'opacity-60 hover:opacity-100'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-[#131517] flex justify-end gap-3">
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="px-6 py-3 border border-white/10 text-white text-xs font-bold uppercase rounded-sm hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name}
            className="px-6 py-3 bg-magma text-black text-xs font-bold uppercase rounded-sm hover:bg-magma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
