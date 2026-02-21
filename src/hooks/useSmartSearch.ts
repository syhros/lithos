// useSmartSearch
//
// Syntax:
//   plain text                        -> fuzzy match description, category, or account
//   account: Halifax, Natwest         -> spaces around : and , are all stripped before parsing
//   account:Halifax,Natwest           -> same
//   type:expense,income               -> OR across types
//   category:groceries                -> category filter
//   amount:12.50                      -> exact absolute amount
//   #  token                          -> AND  (next token must also match)
//   /  token                          -> EXCLUDE (next token must not match)
import { useMemo } from 'react';
import { Transaction } from '../data/mockData';

export type TokenType = 'text' | 'account' | 'type' | 'category' | 'amount';
export type Modifier  = 'and' | 'not' | null;

export interface SearchToken {
  modifier: Modifier;
  field:    TokenType;
  values:   string[];   // OR list — any value matching = token matches
}

// Normalise the raw query before lexing.
// Strips spaces after field colons AND spaces around commas in field values.
// Works on the string char-by-char so it never touches quoted values or
// free-text tokens that happen to contain commas.
function normaliseQuery(raw: string): string {
  const FIELDS = ['account', 'type', 'category', 'amount'];
  let out = '';
  let i = 0;

  while (i < raw.length) {
    // Check if we're at the start of a known field token
    // e.g. "account : halifax , natwest"
    const fieldMatch = FIELDS.find(f => raw.slice(i).toLowerCase().startsWith(f));
    if (fieldMatch) {
      let j = i + fieldMatch.length;
      // skip optional spaces before colon
      while (j < raw.length && raw[j] === ' ') j++;
      if (raw[j] === ':') {
        j++; // consume colon
        // skip spaces after colon
        while (j < raw.length && raw[j] === ' ') j++;
        // emit field: with no spaces
        out += fieldMatch + ':';
        // now consume the value portion (up to the next space NOT inside quotes)
        // stripping spaces around commas as we go
        let inQuote = false;
        while (j < raw.length) {
          const ch = raw[j];
          if (ch === '"') {
            inQuote = !inQuote;
            out += ch;
            j++;
          } else if (!inQuote && ch === ' ') {
            // peek: is the next non-space char a comma?
            let k = j + 1;
            while (k < raw.length && raw[k] === ' ') k++;
            if (k < raw.length && raw[k] === ',') {
              // space(s) before a comma — skip them, the comma handler will follow
              j = k;
            } else {
              // real token boundary
              break;
            }
          } else if (!inQuote && ch === ',') {
            out += ',';
            j++;
            // skip spaces after comma
            while (j < raw.length && raw[j] === ' ') j++;
          } else {
            out += ch;
            j++;
          }
        }
        i = j;
        continue;
      }
    }
    out += raw[i];
    i++;
  }
  return out;
}

// Split a comma-separated string but respect double-quoted segments.
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

function matchToken(token: SearchToken, tx: Transaction, accountName: string): boolean {
  return token.values.some(v => matchSingleValue(token.field, v.toLowerCase(), tx, accountName));
}

function matchSingleValue(field: TokenType, v: string, tx: Transaction, accountName: string): boolean {
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
