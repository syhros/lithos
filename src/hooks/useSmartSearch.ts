// useSmartSearch
//
// Syntax:
//   plain text                         -> fuzzy match description, category, or account
//   account: "Halifax Main", Natwest   -> spaces around : and , are ignored
//   account:"Halifax Main",Natwest     -> same result
//   type:expense,income                -> OR across types
//   category:groceries                 -> category filter
//   amount:12.50                       -> exact absolute amount
//   #  token                           -> AND  (next token must also match)
//   /  token                           -> EXCLUDE (next token must not match)
import { useMemo } from 'react';
import { Transaction } from '../data/mockData';

export type TokenType = 'text' | 'account' | 'type' | 'category' | 'amount';
export type Modifier  = 'and' | 'not' | null;

export interface SearchToken {
  modifier: Modifier;
  field:    TokenType;
  values:   string[];   // OR list — any value matching = token matches
}

// Normalise the raw query string before lexing:
//   1. Strip spaces after colons that follow a known field name
//      e.g. "account: halifax" -> "account:halifax"
//   2. Strip spaces around commas inside a field:value token
//      e.g. "account:halifax , natwest" -> "account:halifax,natwest"
//
// We only collapse spaces inside tokens, not between them, so free-text
// searches with spaces still work.
function normaliseQuery(raw: string): string {
  // Step 1: remove spaces immediately after a field colon
  // Matches: (account|type|category|amount) : <spaces>
  let out = raw.replace(
    /\b(account|type|category|amount)\s*:\s*/gi,
    (_, field) => field.toLowerCase() + ':'
  );

  // Step 2: inside each field:... token (up to the next space that is NOT
  // inside quotes), strip spaces around commas.
  // We do this by processing the string token-by-token.
  const knownFields = ['account', 'type', 'category', 'amount'];
  out = out.replace(
    /(account|type|category|amount):([^\s]*(?:"[^"]*"[^\s]*)*)/gi,
    (match, field, rest) => {
      // Remove spaces around commas in the value portion
      const cleaned = rest.replace(/\s*,\s*/g, ',');
      return field.toLowerCase() + ':' + cleaned;
    }
  );

  return out;
}

// Split a comma-separated string but respect double-quoted segments.
// e.g. '"Halifax Main",Natwest,"foo bar"' -> ['Halifax Main', 'Natwest', 'foo bar']
function splitCommaRespectingQuotes(raw: string): string[] {
  const results: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      const v = current.trim();
      if (v) results.push(v);
      current = '';
    } else {
      current += ch;
    }
  }
  const v = current.trim();
  if (v) results.push(v);
  return results;
}

export function parseSearchQuery(raw: string): SearchToken[] {
  const normalised = normaliseQuery(raw);
  const tokens: SearchToken[] = [];
  const parts: string[] = [];
  const lexRe = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = lexRe.exec(normalised)) !== null) parts.push(m[0]);

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
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const field = raw.slice(0, colonIdx).toLowerCase();
    const rest  = raw.slice(colonIdx + 1);
    const knownFields: TokenType[] = ['account', 'type', 'category', 'amount'];
    const matched = knownFields.find(f => f.startsWith(field));
    if (matched) {
      const values = splitCommaRespectingQuotes(rest).filter(Boolean);
      return { modifier, field: matched, values: values.length ? values : [''] };
    }
  }
  const plain = raw.replace(/^"|"$/g, '').trim();
  return { modifier, field: 'text', values: [plain] };
}

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
      if (token.modifier === 'not') { if (matches)  return false; }
      else                          { if (!matches) return false; }
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
