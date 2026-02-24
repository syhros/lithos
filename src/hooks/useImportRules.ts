import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TransactionType } from '../data/mockData';

export interface TypeMappingRule {
  id: string;
  bankCode: string;
  mapsTo: TransactionType;
}

/**
 * A merchant/description rule.
 *
 * Match fields (AND-gated):
 *   matchDescription  — row.rawDescription must contain `contains`
 *   matchType         — row.resolvedType must equal `matchTypeValue`
 *   matchAmount       — Math.abs(row.rawAmount) must equal `matchAmountValue`
 *   useRegex          — when true, `contains` is treated as regex pattern
 *
 * Set fields (applied when ALL enabled match conditions pass):
 *   setDescription, setCategory, setType,
 *   setAccountId, setAccountToId, setNotes
 */
export interface MerchantRule {
  id: string;
  // ── match conditions ──
  matchDescription: boolean;
  matchType:        boolean;
  matchAmount:      boolean;
  useRegex:         boolean;
  contains:         string;
  matchTypeValue:   TransactionType | '';
  matchAmountValue: number | '';
  // ── set actions ──
  setDescription: string;
  setCategory:    string;
  setType:        TransactionType | '';
  setAccountId:   string;
  setAccountToId: string;
  setNotes:       string;
}

export interface TransferRule {
  id: string;
  label: string;
  fromDescContains: string;
  toDescContains: string;
  toleranceDays: number;
}

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────
const DEFAULT_NATWEST_TYPES: TypeMappingRule[] = [
  { id: 'nw1', bankCode: 'BAC', mapsTo: 'income'  },
  { id: 'nw2', bankCode: 'D/D', mapsTo: 'expense' },
  { id: 'nw3', bankCode: 'S/O', mapsTo: 'expense' },
  { id: 'nw4', bankCode: 'CHG', mapsTo: 'expense' },
];

const DEFAULT_HALIFAX_TYPES: TypeMappingRule[] = [
  { id: 'hx1', bankCode: 'DEB', mapsTo: 'expense'  },
  { id: 'hx2', bankCode: 'FPI', mapsTo: 'income'   },
  { id: 'hx3', bankCode: 'FPO', mapsTo: 'expense'  },
  { id: 'hx4', bankCode: 'DD',  mapsTo: 'expense'  },
  { id: 'hx5', bankCode: 'SO',  mapsTo: 'expense'  },
  { id: 'hx6', bankCode: 'BGC', mapsTo: 'income'   },
  { id: 'hx7', bankCode: 'TFR', mapsTo: 'transfer' },
];

// ─────────────────────────────────────────────
// Helper — blank rule skeleton
// ─────────────────────────────────────────────
export const BLANK_MERCHANT_RULE: Omit<MerchantRule, 'id'> = {
  matchDescription: true,
  matchType:        false,
  matchAmount:      false,
  useRegex:         false,
  contains:         '',
  matchTypeValue:   '',
  matchAmountValue: '',
  setDescription:   '',
  setCategory:      '',
  setType:          '',
  setAccountId:     '',
  setAccountToId:   '',
  setNotes:         '',
};

// ─────────────────────────────────────────────
// applyMerchantRules  (AND-gate with regex support)
// ─────────────────────────────────────────────
export function applyMerchantRules(
  rows: Array<{
    rawDescription: string;
    resolvedType: TransactionType;
    rawAmount: number;
    resolvedDescription: string;
    resolvedCategory: string;
    resolvedAccountId: string;
    resolvedAccountToId: string;
    resolvedNotes: string;
    [key: string]: unknown;
  }>,
  rules: MerchantRule[],
) {
  return rows.map(row => {
    let r = { ...row };
    for (const rule of rules) {
      if (rule.matchDescription) {
        if (!rule.contains) continue;
        if (rule.useRegex) {
          try {
            const regex = new RegExp(rule.contains, 'i');
            if (!regex.test(r.rawDescription)) continue;
          } catch {
            if (!r.rawDescription.toLowerCase().includes(rule.contains.toLowerCase())) continue;
          }
        } else {
          if (!r.rawDescription.toLowerCase().includes(rule.contains.toLowerCase())) continue;
        }
      }
      if (rule.matchType) {
        if (!rule.matchTypeValue) continue;
        if (r.resolvedType !== rule.matchTypeValue) continue;
      }
      if (rule.matchAmount) {
        if (rule.matchAmountValue === '' || rule.matchAmountValue === undefined) continue;
        if (Math.abs(r.rawAmount) !== Number(rule.matchAmountValue)) continue;
      }
      if (!rule.matchDescription && !rule.matchType && !rule.matchAmount) continue;

      if (rule.setDescription) r.resolvedDescription = rule.setDescription;
      if (rule.setCategory)    r.resolvedCategory    = rule.setCategory;
      if (rule.setType)        r.resolvedType        = rule.setType as TransactionType;
      if (rule.setAccountId)   r.resolvedAccountId   = rule.setAccountId;
      if (rule.setAccountToId) r.resolvedAccountToId = rule.setAccountToId;
      if (rule.setNotes)       r.resolvedNotes       = rule.setNotes;
      break;
    }
    return r;
  });
}

// ─────────────────────────────────────────────
// DB row ↔ MerchantRule helpers
// ─────────────────────────────────────────────
function dbRowToMerchantRule(r: Record<string, unknown>): MerchantRule {
  return {
    id:               r.id as string,
    matchDescription: (r.match_description as boolean) ?? true,
    matchType:        (r.match_type        as boolean) ?? false,
    matchAmount:      (r.match_amount      as boolean) ?? false,
    useRegex:         (r.use_regex         as boolean) ?? false,
    contains:         (r.contains          as string)  || '',
    matchTypeValue:   (r.match_type_value  as TransactionType | '') || '',
    matchAmountValue: r.match_amount_value != null ? (r.match_amount_value as number) : '',
    setDescription:   (r.set_description   as string)  || '',
    setCategory:      (r.set_category      as string)  || '',
    setType:          (r.set_type          as TransactionType | '') || '',
    setAccountId:     (r.set_account_id    as string)  || '',
    setAccountToId:   (r.set_account_to_id as string)  || '',
    setNotes:         (r.set_notes         as string)  || '',
  };
}

function merchantRuleToDbRow(
  rule: MerchantRule,
  userId: string,
  sortOrder: number,
) {
  return {
    user_id:            userId,
    contains:           rule.contains,
    match_description:  rule.matchDescription,
    match_type:         rule.matchType,
    match_amount:       rule.matchAmount,
    use_regex:          rule.useRegex,
    match_type_value:   rule.matchTypeValue   || null,
    match_amount_value: rule.matchAmountValue !== '' ? Number(rule.matchAmountValue) : null,
    set_description:    rule.setDescription   || null,
    set_category:       rule.setCategory      || null,
    set_type:           rule.setType          || null,
    set_account_id:     rule.setAccountId     || null,
    set_account_to_id:  rule.setAccountToId   || null,
    set_notes:          rule.setNotes         || null,
    sort_order:         sortOrder,
  };
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────
export function useImportRules() {
  const [typeRules,     setTypeRules]     = useState<TypeMappingRule[]>([...DEFAULT_NATWEST_TYPES, ...DEFAULT_HALIFAX_TYPES]);
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>([]);
  const [transferRules, setTransferRules] = useState<TransferRule[]>([]);
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
        setMerchantRules(merchantRes.data.map((r: any) => dbRowToMerchantRule(r)));
      }
      if (transferRes.data && transferRes.data.length > 0) {
        setTransferRules(transferRes.data.map((r: any) => ({
          id:               r.id,
          label:            r.label             || '',
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

  // ─ Bulk save — type rules ─
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

  // ─ Bulk save — merchant rules ─
  const saveMerchantRules = useCallback(async () => {
    setSaving(prev => ({ ...prev, merchant: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('import_merchant_rules').delete().eq('user_id', user.id);
    const rows = merchantRules
      .filter(r => r.contains)
      .map((r, i) => merchantRuleToDbRow(r, user.id, i));
    if (rows.length) await supabase.from('import_merchant_rules').insert(rows);
    setSaving(prev => ({ ...prev, merchant: false }));
    flashSaved('merchant');
  }, [merchantRules]);

  // ─ Bulk save — transfer rules ─
  const saveTransferRules = useCallback(async () => {
    setSaving(prev => ({ ...prev, transfer: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('import_transfer_rules').delete().eq('user_id', user.id);
    const rows = transferRules
      .filter(r => r.fromDescContains)
      .map((r, i) => ({
        user_id:            user.id,
        label:              r.label             || null,
        from_desc_contains: r.fromDescContains,
        to_desc_contains:   r.toDescContains,
        tolerance_days:     r.toleranceDays,
        sort_order:         i,
      }));
    if (rows.length) await supabase.from('import_transfer_rules').insert(rows);
    setSaving(prev => ({ ...prev, transfer: false }));
    flashSaved('transfer');
  }, [transferRules]);

  const persistMerchantRule = useCallback(async (rule: MerchantRule): Promise<MerchantRule> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return rule;

    const { data: existing } = await supabase
      .from('import_merchant_rules')
      .select('id')
      .eq('user_id', user.id);
    const sortOrder = existing?.length ?? 0;

    const { data, error } = await supabase
      .from('import_merchant_rules')
      .insert(merchantRuleToDbRow(rule, user.id, sortOrder))
      .select()
      .single();

    if (error) {
      console.error('[useImportRules] persistMerchantRule:', error);
      return rule;
    }
    return { ...rule, id: data.id };
  }, []);

  const updateMerchantRule = useCallback(async (rule: MerchantRule): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('import_merchant_rules')
      .select('sort_order')
      .eq('id', rule.id)
      .single();
    const sortOrder = (existing as any)?.sort_order ?? 0;

    const { error } = await supabase
      .from('import_merchant_rules')
      .update(merchantRuleToDbRow(rule, user.id, sortOrder))
      .eq('id', rule.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[useImportRules] updateMerchantRule:', error);
    }
  }, []);

  const deleteMerchantRule = useCallback(async (id: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('import_merchant_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('[useImportRules] deleteMerchantRule:', error);
    }
  }, []);

  return {
    typeRules, setTypeRules,
    merchantRules, setMerchantRules,
    transferRules, setTransferRules,
    loading, saving, saved,
    saveTypeRules, saveMerchantRules, saveTransferRules,
    persistMerchantRule,
    updateMerchantRule,
    deleteMerchantRule,
  };
}
