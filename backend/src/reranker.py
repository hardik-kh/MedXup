"""
CrossEncoder Reranker
Uses BioBERT medical CrossEncoder to rerank retrieved results
"""

from sentence_transformers import CrossEncoder
from typing import List, Dict
import torch


class Reranker:
    """Rerank search results using BioBERT CrossEncoder"""
    
    def __init__(self, model_name: str = "pritamdeka/BioBERT-mnli-snli-scinli-scitail-mednli-stsb"):
        """
        Initialize CrossEncoder reranker
        
        Args:
            model_name: HuggingFace CrossEncoder model
        """
        print(f"📥 Loading CrossEncoder: {model_name}...")
        
        # Check if CUDA is available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load CrossEncoder
        self.model = CrossEncoder(model_name, device=device)
        
        print(f"✅ CrossEncoder loaded on {device}")
    
    def rerank(
        self,
        query: str,
        results: List[Dict],
        top_k: int = 5
    ) -> List[Dict]:
        """
        Rerank results using CrossEncoder
        
        Args:
            query: Original search query
            results: List of search results to rerank
            top_k: Number of top results to return
            
        Returns:
            Reranked results with CrossEncoder scores
        """
        max_doc_length = 360
        if not results:
            return []
        
        # Prepare query-document pairs for CrossEncoder
        pairs = []
        for result in results:
        # Truncate document text
            doc_text = result['text'][:max_doc_length * 4]  # ~400 tokens (rough estimate)
            pairs.append([query, doc_text])
        
        # Get CrossEncoder scores
        scores = self.model.predict(pairs)
        
        # Add scores to results
        for i, result in enumerate(results):
            result['rerank_score'] = float(scores[i])
        
        # Sort by rerank score
        reranked = sorted(results, key=lambda x: x['rerank_score'], reverse=True)
        
        # Return top-k
        return reranked[:top_k]
    
    def rerank_batched(
        self,
        query: str,
        results_dict: Dict[str, List[Dict]],
        top_k_per_source: int = 5
    ) -> Dict[str, List[Dict]]:
        """
        Rerank results from multiple sources separately
        
        Args:
            query: Original search query
            results_dict: Dict mapping source names to results
            top_k_per_source: Top-k to keep per source
            
        Returns:
            Dict with reranked results per source
        """
        reranked_dict = {}
        
        for source, results in results_dict.items():
            if not results:
                reranked_dict[source] = []
                continue

            if source == "dosage":
                # Skip CrossEncoder for BNF — chunks too large, causes truncation
                # Use RRF hybrid search scores directly, take top 3
                sorted_results = sorted(results, key=lambda x: x.get('rrf_score', 0), reverse=True)
                for r in sorted_results:
                    r['rerank_score'] = r.get('rrf_score', 0)
                reranked_dict[source] = sorted_results[:3]
                print(f"   ℹ️  dosage: skipped CrossEncoder, using RRF scores directly")
            elif source == "research":
                # Skip CrossEncoder for Qdrant research papers — already quality-scored
                # by QdrantRetriever; rerank_score is the quality score
                for r in results:
                    if 'rerank_score' not in r:
                        r['rerank_score'] = r.get('quality_scores', {}).get('final', 0)
                reranked_dict[source] = results
                print(f"   ℹ️  research: skipped CrossEncoder, using quality scores directly")
            else:
                top_k = top_k_per_source
                reranked_dict[source] = self.rerank(query, results, top_k)
        
        return reranked_dict