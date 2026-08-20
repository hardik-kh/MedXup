"""
QdrantRetriever — Research Paper Search
========================================
Searches the Qdrant pediatric_research collection for complex cases
(complexity score >= 7). Returns top 3 papers after quality scoring
and soft penalty filtering.

Pipeline:
  1. Encode query with PubMedBERT
  2. Fetch top 10 by vector similarity
  3. Apply quality score: 0.55*vector + 0.25*study_type + 0.20*recency
  4. Apply soft penalties (x0.75) for clinically mismatched papers
  5. Return top 3 as list of dicts matching the rest of the pipeline's format
"""

import hashlib
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer


# ── Study type score table ─────────────────────────────────────────────────────
STUDY_TYPE_SCORE = {
    "systematic_review": 1.00,
    "guideline":         0.90,
    "rct":               0.85,
    "cohort":            0.60,
    "case_report":       0.20,
    "commentary":        0.15,
    "other":             0.40,
}

YEAR_MIN = 2010
YEAR_MAX = 2026   # extend ceiling as corpus grows

PENALTY_MULTIPLIER = 0.75

# ── Soft penalty rules ─────────────────────────────────────────────────────────
# Each rule: (label, check_field, [phrases])
# check_field is "text" (title+abstract) or "journal"
PENALTY_RULES = [
    (
        "LMIC/low-resource context",
        "text",
        [
            "community health worker",
            "community-level health worker",
            "community level health worker",
            "rural bangladesh",
            "rural ethiopia",
            "rural india",
            "rural malawi",
            "low-income countr",
            "low income countr",
            "lmic",
            "who weight band",
            "first-level health facility",
        ]
    ),
    (
        "Neonatal seizures (not febrile seizures)",
        "text",
        [
            "neonatal seizure",
            "neonatal epilepsy",
            "neonatal-onset epilepsy",
            "phenobarbitone as first-line",
            "phenobarbitone first line",
            "phenobarbitone first-line",
            "phenobarbital as first-line",
            "phenobarbital first line",
            "phenobarbital first-line",
            "phb first",
            "neonatal encephalopathy",
            "hypoxic-ischaemic encephalopathy",
            "hypoxic ischemic encephalopathy",
            "neonatal eeg",
            "seizures in neonates",
            "seizures in the neonate",
            "neonatal intensive care unit seizure",
            "nicu seizure",
        ]
    ),
    (
        "UTI prophylaxis (not UTI treatment)",
        "text",
        [
            "vesicoureteral reflux",
            "uti prophylaxis",
            "urinary tract infection prophylaxis",
            "trimethoprim prophylaxis",
            "tmp prophylaxis",
            "antimicrobial prophylaxis for uti",
            "prophylaxis on non-uti",
            "continuous antimicrobial prophylaxis",
        ]
    ),
    (
        "Case report journal (misclassified as guideline)",
        "journal",
        [
            "bmj case reports",
            "case reports in infectious diseases",
            "case reports in pediatrics",
            "case reports in medicine",
            "journal of medical case reports",
            "american journal of case reports",
        ]
    ),
]


def pmid_to_id(pmid: str) -> int:
    """Stable deterministic int ID from PMID. Use for dedup/lookup."""
    return int(hashlib.md5(pmid.encode()).hexdigest(), 16) % (2 ** 63)


def _check_penalty(payload: dict) -> tuple:
    """
    Returns (multiplier, reason_or_None).
    1.0 = no penalty, 0.75 = penalised.
    """
    text    = ((payload.get("title") or "") + " " + (payload.get("abstract") or "")).lower()
    journal = (payload.get("journal") or "").lower()

    for label, field, phrases in PENALTY_RULES:
        search_in = journal if field == "journal" else text
        for phrase in phrases:
            if phrase.lower() in search_in:
                return PENALTY_MULTIPLIER, f"{label} — matched: '{phrase}'"

    return 1.0, None


def _quality_score(payload: dict, vector_score: float) -> dict:
    """
    Compute quality score with breakdown for transparency.
    Returns dict with all components plus final penalised score.
    """
    year = payload.get("year", YEAR_MIN)
    try:
        year = max(YEAR_MIN, min(YEAR_MAX, int(str(year)[:4])))
    except (ValueError, TypeError):
        year = YEAR_MIN
    recency = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)

    study_type = payload.get("study_type", "other")
    type_score = float(payload.get("type_score",
                                   STUDY_TYPE_SCORE.get(study_type, 0.40)))

    raw = round(vector_score * 0.55 + type_score * 0.25 + recency * 0.20, 4)

    penalty_mult, penalty_reason = _check_penalty(payload)
    final = round(raw * penalty_mult, 4)

    return {
        "vector":         round(vector_score, 4),
        "study":          round(type_score,   4),
        "recency":        round(recency,       4),
        "raw":            raw,
        "penalty":        penalty_mult,
        "penalty_reason": penalty_reason,
        "final":          final,
    }


class QdrantRetriever:
    """
    Retrieves top research papers from Qdrant for complex clinical queries.

    Usage:
        retriever = QdrantRetriever(
            qdrant_url="http://localhost:6333",
            collection="pediatric_research",
            embedding_service=existing_embedding_service,   # reuse PubMedBERT
        )
        papers = retriever.search("febrile seizure management infants", top_k=3)
    """

    def __init__(
        self,
        qdrant_url: str,
        collection: str,
        embedding_service=None,          # reuse EmbeddingService if already loaded
        embed_model: str = "pritamdeka/S-PubMedBert-MS-MARCO",
        fetch_k: int = 10,
        final_k: int = 3,
    ):
        self.collection = collection
        self.fetch_k    = fetch_k
        self.final_k    = final_k

        # Connect to Qdrant
        print(f"🔬 Connecting to Qdrant: {qdrant_url} / {collection}")
        self.client = QdrantClient(url=qdrant_url)
        count = self.client.count(collection_name=self.collection).count
        print(f"   ✓ {count:,} vectors indexed")

        # Embedding model — reuse existing service or load fresh
        if embedding_service is not None:
            # Wrap EmbeddingService so we can call encode_text()
            self._embedder = embedding_service
            self._use_service = True
            print(f"   ✓ Reusing existing PubMedBERT embedder")
        else:
            print(f"   Loading PubMedBERT embedder...")
            self._embedder = SentenceTransformer(embed_model)
            self._use_service = False
            print(f"   ✓ PubMedBERT loaded")

    def _encode(self, query: str) -> List[float]:
        """Encode query to vector, compatible with both EmbeddingService and SentenceTransformer."""
        if self._use_service:
            arr = self._embedder.encode_text(query)
            # encode_text returns numpy array, may be 2D
            if hasattr(arr, 'ndim') and arr.ndim > 1:
                arr = arr[0]
            return arr.tolist()
        else:
            return self._embedder.encode(
                query,
                normalize_embeddings=True,
                show_progress_bar=False
            ).tolist()

    def search(self, query: str, top_k: Optional[int] = None) -> List[Dict]:
        """
        Search Qdrant for relevant research papers.

        Args:
            query:  Clinical search query string
            top_k:  Override default final_k if needed

        Returns:
            List of paper dicts, each with keys:
              text, metadata, rerank_score, quality_scores
            Shape matches what rag_engine._format_context() and
            _format_sources() expect for the "research" database.
        """
        k = top_k or self.final_k

        # 1. Vector search
        vec     = self._encode(query)
        results = self.client.query_points(
            collection_name=self.collection,
            query=vec,
            limit=self.fetch_k,
            with_payload=True,
        ).points

        if not results:
            return []

        # 2. Quality score each result
        for r in results:
            r._qs = _quality_score(r.payload, r.score)

        # 3. Sort by final quality score, take top k
        ranked = sorted(results, key=lambda r: r._qs["final"], reverse=True)[:k]

        # 4. Convert to pipeline-compatible dicts
        formatted = []
        for r in ranked:
            p  = r.payload
            qs = r._qs
            formatted.append({
                # "text" field: title + abstract — sent to LLM as context
                "text": (
                    f"Title: {p.get('title', '')}\n"
                    f"Journal: {p.get('journal', '')} ({p.get('year', '')})\n"
                    f"Study type: {p.get('study_type', 'unknown')}\n"
                    f"Abstract: {p.get('abstract', '')}"
                ),
                # "metadata" field: matches _format_sources() expectations
                "metadata": {
                    "pmid":         p.get("pmid", ""),
                    "doi":          p.get("doi", ""),
                    "doi_url":      p.get("doi_url", ""),
                    "title":        p.get("title", ""),
                    "journal":      p.get("journal", ""),
                    "year":         p.get("year", ""),
                    "authors":      p.get("authors", []),
                    "study_type":   p.get("study_type", "other"),
                    "type_score":   p.get("type_score", 0.4),
                    "abstract":     p.get("abstract", ""),
                },
                # Score fields used by _format_sources() and frontend
                "rerank_score":    qs["final"],
                "quality_scores":  qs,
                # Keep raw vector score for debugging
                "vector_score":    qs["vector"],
            })

        return formatted

    def get_collection_stats(self) -> Dict:
        """Return basic stats about the Qdrant collection."""
        count = self.client.count(collection_name=self.collection).count
        return {
            "collection":    self.collection,
            "total_vectors": count,
            "fetch_k":       self.fetch_k,
            "final_k":       self.final_k,
        }
