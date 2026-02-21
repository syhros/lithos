// useSmartSearch
//
// Parses a smart search string into structured tokens, then filters transactions.
//
// Syntax:
//   plain text              -> fuzzy match description, category, or account
//   account:halifax         -> single account filter (partial match)
//   account:halifax,natwest -> multi-value OR  (comma-separated, no spaces)
//   type:expense,income     -> multi-value OR  for type
//   category:groceries      -> category filter
//   amount:12.50            -> exact absolute amount
//
// Operators between tokens:
//   #  AND     - next token must ALSO match
//   /  EXCLUDE - next token must NOT match
//
// Multiple bare tokens with no operator = implicit AND.
import { useMemo } from 'react';
import { Transaction } from '../data/mockData';

export type TokenType = 'text' | 'account' | 'type' | 'category' | 'amount';
export type Modifier  = 'and' | 'not' | null;

export interface SearchToken {
  modifier: Modifier;
  field:    TokenType;
  // values is an array to support comma-separated OR lists
  values:   string[];
}

export function parseSearchQuery(raw: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  const parts: string[] = [];
  const lexRe = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = lexRe.exec(raw)) !== null) parts.push(m[0]);

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (part === '#' || part === '/') {
      const mod: Modifier = part === '#' ? 'and' : 'not';
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
  const unquote = (s: string) => s.replace(/^"|"$/g, '').trim();
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const field  = raw.slice(0, colonIdx).toLowerCase();
    const rest   = raw.slice(colonIdx + 1);
    const knownFields: TokenType[] = ['account', 'type', 'category', 'amount'];
    const matched = knownFields.find(f => f.startsWith(field));
    if (matched) {
      // Split on commas to support multi-value OR: account:halifax,natwest
      const values = rest.split(',').map(unquote).filter(Boolean);
      return { modifier, field: matched, values };
    }
  }
  return { modifier, field: 'text', values: [unquote(raw)] };
}

// A token matches if ANY of its values match (OR within a token)
function matchToken(
  token: SearchToken,
  tx: Transaction,
  accountName: string,
): boolean {
  return token.values.some(v => matchSingleValue(token.field, v.toLowerCase(), tx, accountName));
}

function matchSingleValue(
  field: TokenType,
  v: string,
  tx: Transaction,
  accountName: string,
): boolean {
  switch (field) {
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

export function filterByTokens(
  transactions: Transaction[],
  tokens: SearchToken[],
  accountMap: Record<string, string>,
): Transaction[] {
  if (tokens.length === 0) return transactions;
  return transactions.filter(tx => {
    const acc = accountMap[tx.accountId ?? ''] ?? '';
    for (const token of tokens) {
      const matches = matchToken(token, tx, acc);
      // null = implicit AND, 'and' = explicit AND, 'not' = exclude
      if (token.modifier === 'not') { if (matches) return false; }
      else { if (!matches) return false; }
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
