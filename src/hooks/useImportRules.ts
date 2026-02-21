import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TransactionType } from '../data/mockData';

export interface TypeMappingRule {
  id: string;
  bankCode: string;
  mapsTo: TransactionType;
}

export interface MerchantRule {
  id: string;
  matchDescription: boolean;
  matchType: boolean;
  matchAmount: boolean;
  contains: string;
  setDescription: string;
  setCategory: string;
  setType: TransactionType | '';
  // setAccountId: if set, the rule only applies when resolvedAccountId matches this account.
  // When empty, the rule applies to all accounts.
  setAccountId: string;
  setAccountToId: string;
  setNotes: string;
}

export interface TransferRule {
  id: string;
  label: string;
  fromDescContains: string;
  toDescContains: string;
  toleranceDays: number;
}

const DEFAULT_NATWEST_TYPES: TypeMappingRule[] = [
  { id: 'nw1', bankCode: 'BAC',  mapsTo: 'income'   },
  { id: 'nw2', bankCode: 'D/D',  mapsTo: 'expense'  },
  { id: 'nw3', bankCode: 'S/O',  mapsTo: 'expense'  },
  { id: 'nw4', bankCode: 'CHG',  mapsTo: 'expense'  },
];

const DEFAULT_HALIFAX_TYPES: TypeMappingRule[] = [
  { id: 'hx1', bankCode: 'DEB',  mapsTo: 'expense'  },
  { id: 'hx2', bankCode: 'FPI',  mapsTo: 'income'   },
  { id: 'hx3', bankCode: 'FPO',  mapsTo: 'expense'  },
  { id: 'hx4', bankCode: 'DD',   mapsTo: 'expense'  },
  { id: 'hx5', bankCode: 'SO',   mapsTo: 'expense'  },
  { id: 'hx6', bankCode: 'BGC',  mapsTo: 'income'   },
  { id: 'hx7', bankCode: 'TFR',  mapsTo: 'transfer' },
];

const DEFAULT_TRANSFER_RULES: TransferRule[] = [
  {
    id: 'tr1',
    label: 'Halifax → NatWest (weekly savings)',
    fromDescContains: 'CAMERON REES',
    toDescContains: 'C REES',
    toleranceDays: 2,
  },
];

export function useImportRules() {
  const [typeRules,     setTypeRules]     = useState<TypeMappingRule[]>([...DEFAULT_NATWEST_TYPES, ...DEFAULT_HALIFAX_TYPES]);
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([]);
  const [transferRules, setTransferRules] = useState<TransferRule[]>(DEFAULT_TRANSFER_RULES);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});
  const [saved,         setSaved]         = useState<Record<string, boolean>>({});

  // ─ Load from Supabase on mount ─
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [typeRes, merchantRes, transferRes] = await Promise.all([
        supabase.from('import_type_rules').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('import_merchant_rules').select('*').eq('user_id', user.id).order('sort_order'),
        supabase.from('import_transfer_rules').select('*').eq('user_id', user.id).order('sort_order'),
      ]);

      if (typeRes.data && typeRes.data.length > 0) {
        setTypeRules(typeRes.data.map((r: any) => ({
          id: r.id, bankCode: r.bank_code, mapsTo: r.maps_to as TransactionType,
        })));
      }
      if (merchantRes.data && merchantRes.data.length > 0) {
        setMerchantRules(merchantRes.data.map((r: any) => ({
          id:               r.id,
          matchDescription: r.match_description,
          matchType:        r.match_type,
          matchAmount:      r.match_amount,
          contains:         r.contains,
          setDescription:   r.set_description   || '',
          setCategory:      r.set_category      || '',
          setType:          r.set_type          || '',
          setAccountId:     r.set_account_id    || '',
          setAccountToId:   r.set_account_to_id || '',
          setNotes:         r.set_notes         || '',
        })));
      }
      if (transferRes.data && transferRes.data.length > 0) {
        setTransferRules(transferRes.data.map((r: any) => ({
          id:               r.id,
          label:            r.label            || '',
          fromDescContains: r.from_desc_contains,
          toDescContains:   r.to_desc_contains,
          toleranceDays:    r.tolerance_days,
        })));
      }
      setLoading(false);
    };
    load();
  }, []);

  const flashSaved = (key: string) => {
    setSaved(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000);
  };

  // ─ Manual bulk save (Save button in Rules tab) ─

  const saveTypeRules = useCallback(async () => {
    setSaving(prev => ({ ...prev, type: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('import_type_rules').delete().eq('user_id', user.id);
    const rows = typeRules
      .filter(r => r.bankCode)
      .map(r => ({ user_id: user.id, bank_code: r.bankCode, maps_to: r.mapsTo }));
    if (rows.length) await supabase.from('import_type_rules').insert(rows);
    setSaving(prev => ({ ...prev, type: false }));
    flashSaved('type');
  }, [typeRules]);

  const saveMerchantRules = useCallback(async () => {
    setSaving(prev => ({ ...prev, merchant: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('import_merchant_rules').delete().eq('user_id', user.id);
    const rows = merchantRules
      .filter(r => r.contains)
      .map((r, i) => ({
        user_id:           user.id,
        contains:          r.contains,
        match_description: r.matchDescription,
        match_type:        r.matchType,
        match_amount:      r.matchAmount,
        set_description:   r.setDescription   || null,
        set_category:      r.setCategory      || null,
        set_type:          r.setType          || null,
        set_account_id:    r.setAccountId     || null,
        set_account_to_id: r.setAccountToId   || null,
        set_notes:         r.setNotes         || null,
        sort_order:        i,
      }));
    if (rows.length) await supabase.from('import_merchant_rules').insert(rows);
    setSaving(prev => ({ ...prev, merchant: false }));
    flashSaved('merchant');
  }, [merchantRules]);

  const saveTransferRules = useCallback(async () => {
    setSaving(prev => ({ ...prev, transfer: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('import_transfer_rules').delete().eq('user_id', user.id);
    const rows = transferRules
      .filter(r => r.fromDescContains)
      .map((r, i) => ({
        user_id:            user.id,
        label:              r.label            || null,
        from_desc_contains: r.fromDescContains,
        to_desc_contains:   r.toDescContains,
        tolerance_days:     r.toleranceDays,
        sort_order:         i,
      }));
    if (rows.length) await supabase.from('import_transfer_rules').insert(rows);
    setSaving(prev => ({ ...prev, transfer: false }));
    flashSaved('transfer');
  }, [transferRules]);

  /**
   * Auto-persist a single new merchant rule immediately to Supabase.
   * Called by the "Create Rule" popup in the Preview tab so rules are
   * saved without the user needing to manually press the Save button.
   *
   * The rule is inserted with sort_order = current length so it goes
   * to the end of the list. The returned id from Supabase replaces the
   * temporary client-side id so local state stays in sync.
   */
  const persistMerchantRule = useCallback(async (rule: MerchantRule): Promise<MerchantRule> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return rule; // not authed — rule still lives in local state

    // Use the current count as sort_order so the new rule goes last
    const { data: existing } = await supabase
      .from('import_merchant_rules')
      .select('id')
      .eq('user_id', user.id);
    const sortOrder = existing?.length ?? 0;

    const { data, error } = await supabase
      .from('import_merchant_rules')
      .insert({
        user_id:           user.id,
        contains:          rule.contains,
        match_description: rule.matchDescription,
        match_type:        rule.matchType,
        match_amount:      rule.matchAmount,
        set_description:   rule.setDescription   || null,
        set_category:      rule.setCategory      || null,
        set_type:          rule.setType          || null,
        set_account_id:    rule.setAccountId     || null,
        set_account_to_id: rule.setAccountToId   || null,
        set_notes:         rule.setNotes         || null,
        sort_order:        sortOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('[useImportRules] failed to persist merchant rule:', error);
      return rule;
    }

    // Return the rule with the real DB id so React state is consistent
    return { ...rule, id: data.id };
  }, []);

  return {
    typeRules, setTypeRules,
    merchantRules, setMerchantRules,
    transferRules, setTransferRules,
    loading, saving, saved,
    saveTypeRules, saveMerchantRules, saveTransferRules,
    persistMerchantRule,
  };
}
