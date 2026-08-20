"""
Test Nelson Textbook Search
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.embedding_service import EmbeddingService
from src.vector_store import VectorStore
import config


def test_search(query: str, top_k: int = 3):
    """
    Test search in Nelson collection
    
    Args:
        query: Search query
        top_k: Number of results
    """
    
    print("\n" + "="*70)
    print("🔍 NELSON TEXTBOOK SEARCH TEST")
    print("="*70)
    
    # Initialize
    print("\n1️⃣ Loading embedding model...")
    embedding_service = EmbeddingService(config.EMBEDDING_MODEL_NAME)
    
    print("\n2️⃣ Loading Nelson collection...")
    vector_store = VectorStore(
        persist_directory="/content/drive/MyDrive/backend/data/chroma_db",
        collection_name="nelson_textbook"
    )
    
    # Generate query embedding
    print(f"\n3️⃣ Searching for: '{query}'")
    query_emb = embedding_service.encode_text(query)
    if len(query_emb.shape) > 1:
        query_emb = query_emb[0]
    query_emb = query_emb.tolist()
    
    # Search
    results = vector_store.search(query_emb, n_results=top_k)
    
    # Display results
    print("\n" + "="*70)
    print(f"📚 TOP {top_k} RESULTS")
    print("="*70 + "\n")
    
    for i in range(len(results['ids'])):
        meta = results['metadatas'][i]
        sim = 1 - results['distances'][i]
        
        print(f"Result {i+1}:")
        print(f"  Chapter: {meta['chapter_number']} - {meta['chapter_title']}")
        print(f"  Section: {meta['section_title']}")
        if meta.get('subsection_title') and meta['subsection_title'] != 'N/A':
            print(f"  Subsection: {meta['subsection_title']}")
        print(f"  Pages: {meta['page_start']}-{meta['page_end']}")
        print(f"  Relevance: {sim:.1%}")
        print(f"\n  Preview:")
        print(f"  {results['documents'][i][:400]}...")
        print("\n" + "-"*70 + "\n")
    
    print("="*70 + "\n")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", default="fever and vomiting in children", help="Search query")
    parser.add_argument("--top-k", type=int, default=3, help="Number of results")
    
    args = parser.parse_args()
    
    test_search(args.query, args.top_k)