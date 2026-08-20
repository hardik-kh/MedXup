"""
DrugTableLookup - BNF Drug Table Lookup
Replaces BNF vector store with structured Excel table lookup.

Pipeline:
  1. Drug name search  → all rows matching drug name (fuzzy)
  2. Symptom BM25      → top 10 rows by clinical query relevance
  3. Deduplicate       → merge, remove exact duplicates
  4. Format as table   → send to LLM (which handles age/weight filtering)
"""

import re
import math
import openpyxl
from typing import List, Dict, Tuple, Optional
from collections import Counter


# ─────────────────────────────────────────────
# Minimal BM25 implementation (no dependencies)
# ─────────────────────────────────────────────

def _tokenize(text: str) -> List[str]:
    """Lowercase, strip punctuation, split into tokens."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return [t for t in text.split() if len(t) > 1]


class BM25:
    """BM25 retrieval over a list of documents (strings)."""

    def __init__(self, documents: List[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = [_tokenize(doc) for doc in documents]
        self.n = len(self.corpus)
        self.avgdl = sum(len(d) for d in self.corpus) / max(self.n, 1)

        # Document frequency per term
        self.df: Dict[str, int] = {}
        for doc in self.corpus:
            for term in set(doc):
                self.df[term] = self.df.get(term, 0) + 1

    def score(self, query: str, doc_idx: int) -> float:
        tokens = _tokenize(query)
        doc = self.corpus[doc_idx]
        doc_len = len(doc)
        tf_map = Counter(doc)
        score = 0.0
        for term in tokens:
            if term not in self.df:
                continue
            tf = tf_map.get(term, 0)
            idf = math.log((self.n - self.df[term] + 0.5) / (self.df[term] + 0.5) + 1)
            tf_norm = (tf * (self.k1 + 1)) / (
                tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
            )
            score += idf * tf_norm
        return score

    def top_k(self, query: str, k: int = 10) -> List[Tuple[int, float]]:
        """Return (doc_idx, score) sorted by score descending."""
        scores = [(i, self.score(query, i)) for i in range(self.n)]
        scores = [(i, s) for i, s in scores if s > 0]
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:k]


# ─────────────────────────────────────────────
# Fuzzy drug name matching (no rapidfuzz needed)
# ─────────────────────────────────────────────

def _normalize_drug(name: str) -> str:
    """Lowercase, strip common suffixes and punctuation."""
    name = name.lower().strip()
    name = re.sub(r'[^a-z0-9\s]', '', name)
    # Strip route suffixes that sometimes appear in drug names
    name = re.sub(r'\s+(hydrochloride|sulfate|sodium|acetate|nitrate|phosphate|tartrate)$', '', name)
    return name.strip()


def _drug_matches(query_drug: str, table_drug: str, threshold: float = 0.70) -> bool:
    """
    Check if query_drug matches table_drug.
    Uses exact match first, then character n-gram similarity as fallback.
    """
    q = _normalize_drug(query_drug)
    t = _normalize_drug(table_drug)

    # Exact match
    if q == t:
        return True

    # One contains the other (handles "cephalexin" vs "cefalexin (cephalexin)")
    if q in t or t in q:
        return True

    # Character bigram similarity
    def bigrams(s):
        return set(s[i:i+2] for i in range(len(s) - 1))

    q_bi = bigrams(q)
    t_bi = bigrams(t)
    if not q_bi or not t_bi:
        return False
    intersection = len(q_bi & t_bi)
    similarity = (2 * intersection) / (len(q_bi) + len(t_bi))
    return similarity >= threshold


# ─────────────────────────────────────────────
# Main lookup class
# ─────────────────────────────────────────────

class DrugTableLookup:
    """
    Looks up drug dosing from structured BNF Excel table.

    Columns expected:
      0: drug name
      1: when it is used
      2: for which symptoms
      3: dosage
      4: for what age children
      5: source file
    """

    def __init__(self, xlsx_path: str):
        print(f"📋 Loading drug table from {xlsx_path}...")
        self.rows = self._load(xlsx_path)
        print(f"   ✓ Loaded {len(self.rows)} rows")

        # Build BM25 index on: drug_name + symptoms (combined)
        bm25_docs = [
            f"{r['drug_name']} {r['symptoms']}"
            for r in self.rows
        ]
        self.bm25 = BM25(bm25_docs)
        print(f"   ✓ BM25 index built ({len(bm25_docs)} documents)")

    def _load(self, path: str) -> List[Dict]:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows = []
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
            if not row[0]:
                continue
            rows.append({
                "idx":       i,
                "drug_name": str(row[0]).strip() if row[0] else "",
                "when_used": str(row[1]).strip() if row[1] else "",
                "symptoms":  self._clean_symptoms(str(row[2])) if row[2] else "",
                "dosage":    str(row[3]).strip() if row[3] else "",
                "age":       str(row[4]).strip() if row[4] else "",
                "source":    str(row[5]).strip() if row[5] else "",
            })
        wb.close()
        return rows

    def _clean_symptoms(self, text: str) -> str:
        """Strip route suffixes like (BY MOUTH) from symptoms."""
        text = re.sub(r'\(BY [A-Z ]+\)', '', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    # ── Drug name search ──────────────────────────────────────────────────

    def search_by_drug(self, drug_name: str) -> List[Dict]:
        """Return all rows where drug name fuzzy-matches query."""
        results = [
            r for r in self.rows
            if _drug_matches(drug_name, r['drug_name'])
        ]
        return results

    # ── Symptom BM25 search ───────────────────────────────────────────────

    def search_by_symptoms(self, clinical_query: str, top_k: int = 10) -> List[Dict]:
        """Return top_k rows by BM25 score on symptoms + drug name field."""
        hits = self.bm25.top_k(clinical_query, k=top_k)
        return [self.rows[idx] for idx, _ in hits]

    # ── Combined lookup ───────────────────────────────────────────────────

    def lookup(
        self,
        drug_names: List[str],
        clinical_query: str,
        symptom_top_k: int = 10,
    ) -> str:
        """
        Main entry point.
        1. Drug name search for each drug → all matching rows
        2. Symptom BM25 search → top_k rows
        3. Deduplicate (exact row match)
        4. Format as markdown table for LLM
        """
        drug_rows = []
        unmatched_drugs = []
        for drug in drug_names:
            matches = self.search_by_drug(drug)
            if matches:
                print(f"   Drug '{drug}': {len(matches)} rows found")
            else:
                print(f"   Drug '{drug}': ⚠️  no match found")
                unmatched_drugs.append(drug)
            drug_rows.extend(matches)

        symptom_rows = self.search_by_symptoms(clinical_query, top_k=symptom_top_k)
        print(f"   Symptom BM25: {len(symptom_rows)} rows found")

        # Merge: drug rows first, then symptom rows not already included
        seen = set()
        merged = []

        def row_key(r):
            return (r['drug_name'], r['dosage'], r['age'])

        for r in drug_rows:
            k = row_key(r)
            if k not in seen:
                seen.add(k)
                merged.append(r)

        for r in symptom_rows:
            k = row_key(r)
            if k not in seen:
                seen.add(k)
                merged.append(r)

        print(f"   Total unique rows to LLM: {len(merged)}")

        if not merged:
            table_text = "No dosing information found in BNF drug table."
        else:
            table_text = self._format_table(merged)

        if unmatched_drugs:
            table_text += (
                "\n\nNO LOCAL BNFC ROW FOUND FOR: "
                + ", ".join(unmatched_drugs)
            )

        return table_text

    # ── Formatting ────────────────────────────────────────────────────────

    def _format_table(self, rows: List[Dict]) -> str:
        lines = [
            "BNF FOR CHILDREN — DOSING TABLE",
            "=" * 60,
        ]
        for r in rows:
            lines.append(
                f"Drug: {r['drug_name']} | "
                f"Indication: {r['symptoms']} | "
                f"Dosage: {r['dosage']} | "
                f"Age/Weight: {r['age']}"
            )
        lines.append("=" * 60)
        lines.append(
            "\nNOTE: Select the appropriate dosage row based on the patient's "
            "exact age and weight from the table above."
        )
        return "\n".join(lines)
