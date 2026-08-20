"""
ChromaDB vector store wrapper
"""

import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional
import numpy as np
from pathlib import Path


class VectorStore:
    """ChromaDB wrapper for document storage"""
    
    def __init__(self, persist_directory: str, collection_name: str = "medical_papers"):
        """Initialize ChromaDB"""
        self.persist_dir = Path(persist_directory)
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        
        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 200,
                "hnsw:M": 16,
                "hnsw:search_ef": 100
            }
        )
        
        print(f"✓ ChromaDB: {collection_name}")
        print(f"  Location: {self.persist_dir}")
        print(f"  Documents: {self.collection.count()}")
    
    def add_chunks(self, texts: List[str], embeddings: List[List[float]], 
                   metadatas: List[Dict], ids: List[str]):
        """Add chunks to collection"""
        if isinstance(embeddings, np.ndarray):
            embeddings = embeddings.tolist()
        
        self.collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
    
    def search(self, query_embedding: List[float], 
               n_results: int = 5) -> Dict:
        """
        Search for similar documents
        
        Returns:
            Dict with keys: ids, documents, metadatas, distances
        """
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        return {
            'ids': results['ids'][0],
            'documents': results['documents'][0],
            'metadatas': results['metadatas'][0],
            'distances': results['distances'][0]
        }
    
    def get_count(self) -> int:
        """Get total documents"""
        return self.collection.count()


class VectorStoreManager:
    """High-level manager"""
    
    def __init__(self, persist_directory: str, collection_name: str = "medical_papers"):
        self.vector_store = VectorStore(persist_directory, collection_name)
    
    def search_similar(self, query_embedding: List[float], top_k: int = 5) -> List[Dict]:
        """Search and format results"""
        results = self.vector_store.search(query_embedding, top_k)
        
        formatted = []
        for i in range(len(results['ids'])):
            formatted.append({
                'id': results['ids'][i],
                'text': results['documents'][i],
                'metadata': results['metadatas'][i],
                'similarity': 1 - results['distances'][i],
                'distance': results['distances'][i]
            })
        
        return formatted