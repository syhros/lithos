// useSmartSearch
//
// Parses a smart search string into structured tokens, then filters a
// transaction list against them.
//
// Syntax:
//   plain text     -> fuzzy match description, category, or account name
//   account:value  -> match account name (partial)
//   type:value     -> match transaction type
//   category:value -> match category (partial)
//   amount:value   -> match absolute amount (e.g. amount:12.50)
//
//   &  (OR)      -> show results matching EITHER the left OR right token
//   #  (AND)     -> show results matching BOTH the left AND right token
//   /  (EXCLUDE) -> show results matching the first, excluding the second
//
// Multiple bare tokens (no operator) are treated as implicit AND.
// Wrap multi-word values in quotes: account:"Halifax Current"
import { useMemo } from 'react';
import { Transaction } from '../data/mockData';

export type TokenType = 'text' | 'account' | 'type' | 'category' | 'amount';
export type Modifier  = 'or' | 'and' | 'not' | null;

export interface SearchToken {
  modifier: Modifier;
  field:    TokenType;
  value:    string;
}

export function parseSearchQuery(raw: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  // Lex: split on whitespace but respect quoted strings
  const parts: string[] = [];
  const lexRe = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = lexRe.exec(raw)) !== null) parts.push(m[0]);

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (part === '&' || part === '#' || part === '/') {
      const mod: Modifier = part === '&' ? 'or' : part === '#' ? 'and' : 'not';
      i++;
      if (i < parts.length) { tokens.push(buildToken(mod, parts[i])); i++; }
      continue;
    }
    tokens.push(buildToken(null, part));
    i++;
  }
  return tokens;
}

function buildToken(modifier: Modifier, raw: string): SearchToken {
  const unquote = (s: string) => s.replace(/^"|"$/g, '');
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const field  = raw.slice(0, colonIdx).toLowerCase();
    const value  = unquote(raw.slice(colonIdx + 1));
    const knownFields: TokenType[] = ['account', 'type', 'category', 'amount'];
    const matched = knownFields.find(f => f.startsWith(field));
    if (matched) return { modifier, field: matched, value };
  }
  return { modifier, field: 'text', value: unquote(raw) };
}

function matchToken(
  token: SearchToken,
  tx: Transaction,
  accountName: string,
): boolean {
  const v = token.value.toLowerCase();
  switch (token.field) {
    case 'account':  return accountName.toLowerCase().includes(v);
    case 'type':     return tx.type.toLowerCase().includes(v);
    case 'category': return tx.category.toLowerCase().includes(v);
    case 'amount': {
      const n = parseFloat(v);
      return !isNaN(n) && Math.abs(tx.amount) === n;
    }
    case 'text':
    default:
      return (
        tx.description.toLowerCase().includes(v) ||
        tx.category.toLowerCase().includes(v) ||
        accountName.toLowerCase().includes(v)
      );
  }
}

// Filter logic:
//   null / 'and' tokens   -> ALL must match (implicit AND chain)
//   'or' tokens           -> pass if ANY 'or' token matches (OR pool)
//   'not' tokens          -> fail if ANY 'not' token matches
//
// Evaluation order per row:
//   1. Collect non-modifier (null) base terms — all must match
//   2. Collect 'and' terms — all must match
//   3. Collect 'or' terms  — at least one must match (only if any exist)
//   4. Collect 'not' terms — none must match
export function filterByTokens(
  transactions: Transaction[],
  tokens: SearchToken[],
  accountMap: Record<string, string>,
): Transaction[] {
  if (tokens.length === 0) return transactions;

  const baseTokens = tokens.filter(t => t.modifier === null);
  const andTokens  = tokens.filter(t => t.modifier === 'and');
  const orTokens   = tokens.filter(t => t.modifier === 'or');
  const notTokens  = tokens.filter(t => t.modifier === 'not');

  return transactions.filter(tx => {
    const acc = accountMap[tx.accountId ?? ''] ?? '';

    // Base (implicit AND)
    for (const t of baseTokens) {
      if (!matchToken(t, tx, acc)) return false;
    }
    // Explicit AND
    for (const t of andTokens) {
      if (!matchToken(t, tx, acc)) return false;
    }
    // OR pool — at least one must match (skip check if pool is empty)
    if (orTokens.length > 0) {
      if (!orTokens.some(t => matchToken(t, tx, acc))) return false;
    }
    // NOT / exclude
    for (const t of notTokens) {
      if (matchToken(t, tx, acc)) return false;
    }
    return true;
  });
}

export function useSmartSearch(
  transactions: Transaction[],
  accountMap: Record<string, string>,
  query: string,
  filterType: string,
  sortBy: string,
): Transaction[] {
  return useMemo(() => {
    const tokens = parseSearchQuery(query);
    let filtered = filterByTokens(transactions, tokens, accountMap);
    if (filterType !== 'all') filtered = filtered.filter(tx => tx.type === filterType);
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':      return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'oldest':      return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-high': return Math.abs(b.amount) - Math.abs(a.amount);
        case 'amount-low':  return Math.abs(a.amount) - Math.abs(b.amount);
        default:            return 0;
      }
    });
  }, [transactions, accountMap, query, filterType, sortBy]);
}
