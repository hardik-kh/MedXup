"""
Hybrid Retriever - Combines BM25 (lexical) and Semantic (dense) search
Uses Reciprocal Rank Fusion (RRF) to merge results
"""

from rank_bm25 import BM25Okapi
from typing import List, Dict, Tuple
import numpy as np
from src.vector_store import VectorStore
from src.embedding_service import EmbeddingService


class HybridRetriever:
    """Hybrid search combining BM25 and semantic search"""
    
    def __init__(
        self,
        vector_store: VectorStore,
        embedding_service: EmbeddingService,
        bm25_weight: float = 0.3,
        semantic_weight: float = 0.7
    ):
        """
        Initialize hybrid retriever
        
        Args:
            vector_store: ChromaDB vector store
            embedding_service: Embedding service for semantic search
            bm25_weight: Weight for BM25 scores (0-1)
            semantic_weight: Weight for semantic scores (0-1)
        """
        self.vector_store = vector_store
        self.embedding_service = embedding_service
        self.bm25_weight = bm25_weight
        self.semantic_weight = semantic_weight
        
        # BM25 index (will be built on first search)
        self.bm25 = None
        self.corpus = None
        self.doc_ids = None
        self.metadatas = None
        
        print(f"✅ Hybrid retriever initialized (BM25: {bm25_weight}, Semantic: {semantic_weight})")

        # Pre-build BM25 index at startup so first query isn't slow
        self.build_bm25_index()
    
    def build_bm25_index(self):
        """
        Build BM25 index from all documents in vector store
        This is called lazily on first search
        """
        print("🔨 Building BM25 index...")
        
        # Get all documents from vector store
        all_data = self.vector_store.collection.get(
            include=['documents', 'metadatas']
        )
        
        self.doc_ids = all_data['ids']
        self.corpus = all_data['documents']
        self.metadatas = all_data['metadatas']
        
        # Tokenize corpus for BM25
        tokenized_corpus = [doc.lower().split() for doc in self.corpus]
        
        # Build BM25 index
        self.bm25 = BM25Okapi(tokenized_corpus)
        
        print(f"✅ BM25 index built with {len(self.corpus)} documents")
    
    def search(
        self,
        query: str,
        top_k: int = 10
    ) -> List[Dict]:
        """
        Hybrid search with BM25 + Semantic fusion
        
        Args:
            query: Search query
            top_k: Number of results to return
            
        Returns:
            List of results with scores and metadata
        """
        # 1. BM25 Search (Lexical)
        bm25_results = self._bm25_search(query, top_k * 2)  # Get more candidates
        
        # 2. Semantic Search
        semantic_results = self._semantic_search(query, top_k * 2)
        
        # 3. Merge using Reciprocal Rank Fusion (RRF)
        merged_results = self._reciprocal_rank_fusion(
            bm25_results,
            semantic_results,
            top_k
        )
        
        return merged_results
    
    def _bm25_search(self, query: str, top_k: int) -> List[Dict]:
        """
        BM25 lexical search
        
        Args:
            query: Search query
            top_k: Number of results
            
        Returns:
            List of results with BM25 scores
        """
        # Tokenize query
        tokenized_query = query.lower().split()
        
        # Get BM25 scores for all documents
        scores = self.bm25.get_scores(tokenized_query)
        
        # Get top-k indices
        top_indices = np.argsort(scores)[::-1][:top_k]
        
        # Build results
        results = []
        for idx in top_indices:
            if scores[idx] > 0:  # Only include non-zero scores
                results.append({
                    'id': self.doc_ids[idx],
                    'text': self.corpus[idx],
                    'metadata': self.metadatas[idx],
                    'bm25_score': float(scores[idx]),
                    'rank': len(results) + 1
                })
        
        return results
    
    def _semantic_search(self, query: str, top_k: int) -> List[Dict]:
        """
        Semantic (dense vector) search using ChromaDB
        
        Args:
            query: Search query
            top_k: Number of results
            
        Returns:
            List of results with semantic similarity scores
        """
        # Generate query embedding
        query_embedding = self.embedding_service.encode_text(query)
        
        # Ensure it's a list
        if len(query_embedding.shape) > 1:
            query_embedding = query_embedding[0]
        query_embedding = query_embedding.tolist()
        
        # Search in ChromaDB
        results = self.vector_store.search(
            query_embedding=query_embedding,
            n_results=top_k
        )
        
        # Format results
        formatted_results = []
        for i in range(len(results['ids'])):
            # ChromaDB returns distance, convert to similarity (1 - distance)
            similarity = 1 - results['distances'][i]
            
            formatted_results.append({
                'id': results['ids'][i],
                'text': results['documents'][i],
                'metadata': results['metadatas'][i],
                'semantic_score': float(similarity),
                'rank': i + 1
            })
        
        return formatted_results
    
    def _reciprocal_rank_fusion(
        self,
        bm25_results: List[Dict],
        semantic_results: List[Dict],
        top_k: int
    ) -> List[Dict]:
        """
        Merge BM25 and semantic results using Reciprocal Rank Fusion
        
        RRF formula: score(d) = Σ 1 / (k + rank(d))
        where k is a constant (typically 60)
        
        Args:
            bm25_results: Results from BM25 search
            semantic_results: Results from semantic search
            top_k: Number of final results
            
        Returns:
            Merged and ranked results
        """
        k = 60  # RRF constant
        
        # Create a dict to accumulate scores
        doc_scores = {}
        doc_data = {}
        
        # Add BM25 scores
        for result in bm25_results:
            doc_id = result['id']
            rrf_score = self.bm25_weight / (k + result['rank'])
            
            doc_scores[doc_id] = doc_scores.get(doc_id, 0) + rrf_score
            doc_data[doc_id] = {
                'text': result['text'],
                'metadata': result['metadata'],
                'bm25_score': result.get('bm25_score', 0),
                'semantic_score': 0
            }
        
        # Add semantic scores
        for result in semantic_results:
            doc_id = result['id']
            rrf_score = self.semantic_weight / (k + result['rank'])
            
            doc_scores[doc_id] = doc_scores.get(doc_id, 0) + rrf_score
            
            if doc_id not in doc_data:
                doc_data[doc_id] = {
                    'text': result['text'],
                    'metadata': result['metadata'],
                    'bm25_score': 0,
                    'semantic_score': result.get('semantic_score', 0)
                }
            else:
                doc_data[doc_id]['semantic_score'] = result.get('semantic_score', 0)
        
        # Sort by combined RRF score
        sorted_docs = sorted(
            doc_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_k]
        
        # Build final results
        final_results = []
        for doc_id, rrf_score in sorted_docs:
            final_results.append({
                'id': doc_id,
                'text': doc_data[doc_id]['text'],
                'metadata': doc_data[doc_id]['metadata'],
                'rrf_score': float(rrf_score),
                'bm25_score': doc_data[doc_id]['bm25_score'],
                'semantic_score': doc_data[doc_id]['semantic_score']
            })
        
        return final_results