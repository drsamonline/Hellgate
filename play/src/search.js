// ---------------------------------------------------------------------------
// SEARCH — a ranked inverted index, small enough to build on every boot.
//
// The codex has ninety entries. A linear filter would work; a ranked index works
// better and costs 200 lines, so the codex searches the way a player expects:
// type "kiln fire" and the kiln comes first, mistype "kilm" and it still does.
//
// Ported from `search-kit` (PolyForm Noncommercial 1.0.0, same author): the
// tokeniser, the tf-idf weighting and the Levenshtein fallback are that kit's.
// ---------------------------------------------------------------------------

const norm = (s) => String(s == null ? '' : s).toLowerCase();

/** Words, lowercased, punctuation dropped. */
export function tokenise(s) {
  return norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
}

/** Levenshtein distance, capped: anything past `max` returns max + 1. */
export function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function fieldText(item, keys) {
  if (typeof item === 'string') return item;
  if (!keys || !keys.length) return Object.keys(item).map((k) => item[k]).join(' ');
  return keys.map((k) => {
    const v = item[k];
    return Array.isArray(v) ? v.join(' ') : (v == null ? '' : String(v));
  }).join(' ');
}

/**
 * Build an index over `items`.
 *
 * `keys` names the fields to index; without it every field is used. A term that
 * appears in few documents is worth more (tf-idf), so a rare exact word outranks
 * a common one — which is what makes ranked search feel right rather than merely
 * correct.
 */
export function index(items = [], opts = {}) {
  const keys = opts.keys || null;
  const postings = {};         // token -> { docIndex: count }
  items.forEach((item, di) => {
    const tk = tokenise(fieldText(item, keys));
    const seen = {};
    for (const t of tk) {
      if (seen[t]) { postings[t][di] += 1; continue; }
      seen[t] = 1;
      (postings[t] = postings[t] || {})[di] = 1;
    }
  });
  const vocab = Object.keys(postings);

  const idf = (term) => {
    const df = postings[term] ? Object.keys(postings[term]).length : 0;
    return df ? Math.log(1 + items.length / df) : 0;
  };

  /** Exact token, then any token that starts with it. */
  const candidates = (term) => {
    if (postings[term]) return { docs: postings[term], weight: 1 };
    const starts = vocab.filter((t) => t.startsWith(term));
    if (!starts.length) return null;
    const docs = {};
    for (const t of starts) for (const d of Object.keys(postings[t])) docs[d] = (docs[d] || 0) + postings[t][d];
    return { docs, weight: 0.6 };
  };

  /** A typo still finds the entry: one or two edits, best first. */
  const fuzzy = (term) => {
    const max = term.length > 5 ? 2 : 1;
    const docs = {};
    let hit = false;
    for (const t of vocab) {
      if (lev(term, t, max) <= max) {
        hit = true;
        for (const d of Object.keys(postings[t])) docs[d] = (docs[d] || 0) + postings[t][d];
      }
    }
    return hit ? { docs, weight: 0.3 } : null;
  };

  return {
    size: items.length,
    vocabulary: vocab.length,
    /**
     * Ranked results: `{ item, index, score }`, best first.
     * `opts.fuzzy` allows a misspelling to match; `opts.limit` truncates.
     */
    query(q, opts = {}) {
      const terms = tokenise(q);
      if (!terms.length) return [];
      const scores = {};
      for (const term of terms) {
        const c = candidates(term) || (opts.fuzzy ? fuzzy(term) : null);
        if (!c) continue;
        const w = c.weight * idf(term) || c.weight * 0.1;
        for (const d of Object.keys(c.docs)) scores[d] = (scores[d] || 0) + c.docs[d] * w;
      }
      const out = Object.keys(scores).map((d) => ({ item: items[d], index: +d, score: scores[d] }));
      out.sort((a, b) => (b.score - a.score) || (a.index - b.index));
      return opts.limit ? out.slice(0, opts.limit) : out;
    },
  };
}
