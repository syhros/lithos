/**
 * useSmartSearch
 *
 * Parses a smart search string into structured tokens, then filters a
 * transaction list against them.
 *
 * Syntax:
 *   plain text          → fuzzy match description or category
 *   account:value       → match account name (partial)
 *   type:value          → match transaction type
 *   category:value      → match category (partial)
 *   amount:value        → match absolute amount (e.g. amount:12.50)
 *   *& token            → AND – next token must ALSO match
 *   */ token            → NOT – next token must NOT match
 *
 * Multiple tokens are ANDed by default.
 * Wrap multi-word values in quotes: account:"Halifax Current"
 */
import { useMemo } from 'react';
import { Transaction } from '../data/mockData';

export type TokenType = 'text' | 'account' | 'type' | 'category' | 'amount';
export type Modifier  = 'and' | 'not' | null;

export interface SearchToken {
  modifier: Modifier;   // null = plain AND
  field:    TokenType;
  value:    string;
}

/** Tokenise a smart search query string. */
export function parseSearchQuery(raw: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  // Lex: split on spaces but respect quoted strings
  const parts: string[] = [];
  const lexRe = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = lexRe.exec(raw)) !== null) parts.push(m[0]);

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    // Modifier sentinel
    if (part === '*&' || part === '*/') {
      const mod: Modifier = part === '*&' ? 'and' : 'not';
      i++;
      if (i < parts.length) {
        tokens.push(buildToken(mod, parts[i]));
        i++;
      }
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

/** Apply parsed tokens to a single transaction. Returns true if it passes all filters. */
function matchToken(
  token: SearchToken,
  tx: Transaction,
  accountName: string,
): boolean {
  const v = token.value.toLowerCase();
  switch (token.field) {
    case 'account':
      return accountName.toLowerCase().includes(v);
    case 'type':
      return tx.type.toLowerCase().includes(v);
    case 'category':
      return tx.category.toLowerCase().includes(v);
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

export function filterByTokens(
  transactions: Transaction[],
  tokens: SearchToken[],
  accountMap: Record<string, string>,
): Transaction[] {
  if (tokens.length === 0) return transactions;

  return transactions.filter(tx => {
    const accountName = accountMap[tx.accountId ?? ''] ?? '';
    for (const token of tokens) {
      const matches = matchToken(token, tx, accountName);
      if (token.modifier === 'not') {
        if (matches) return false; // NOT – must NOT match
      } else {
        if (!matches) return false; // AND (default) – must match
      }
    }
    return true;
  });
}

/** Hook: returns filtered + sorted transactions. */
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
