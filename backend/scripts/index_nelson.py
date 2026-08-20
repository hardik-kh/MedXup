"""
Index Nelson Textbook - Production Script
Run in Colab Pro for best performance
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.extractors.azure_doc_intelligence import AzureDocExtractor
from src.extractors.nelson_parser import NelsonParser
from src.embedding_service import EmbeddingService
from src.vector_store import VectorStore
import config


def main(nelson_pdf_path: str, save_json: str = None, use_saved: bool = False):
    """
    Complete Nelson indexing pipeline
    
    Args:
        nelson_pdf_path: Path to Nelson PDF
        save_json: Save extracted pages as JSON
        use_saved: Skip extraction, use existing JSON
    """
    print("\n" + "="*70)
    print("📚 INDEXING NELSON TEXTBOOK")
    print("="*70)
    
    # STEP 1: Extract or load pages
    if use_saved and save_json and Path(save_json).exists():
        print("\n1️⃣ Loading saved extraction...")
        with open(save_json, 'r') as f:
            pages = json.load(f)
        print(f"   ✅ Loaded {len(pages)} pages")
    else:
        print("\n1️⃣ Extracting PDF (pages 81-5773)...")
        extractor = AzureDocExtractor()
        pages = extractor.extract_pdf(
            pdf_path=nelson_pdf_path,
            page_start=81,
            page_end=5773
        )
        
        if save_json:
            print(f"\n💾 Saving to {save_json}...")
            Path(save_json).parent.mkdir(parents=True, exist_ok=True)
            with open(save_json, 'w') as f:
                json.dump(pages, f)
            print("   ✅ Saved")
    
    # STEP 2: Parse structure
    print("\n2️⃣ Parsing chapters and sections...")
    parser = NelsonParser()
    sections = parser.parse_pages(pages)
    
    # STEP 3: Create chunks
    chunks = parser.create_chunks(sections)
    
    # STEP 4: Generate embeddings
    print("\n3️⃣ Generating embeddings...")
    embedding_service = EmbeddingService(config.EMBEDDING_MODEL_NAME)
    texts = [c['text'] for c in chunks]
    embeddings = embedding_service.encode_batch(texts, batch_size=32)
    print(f"   ✅ Generated {len(embeddings)} embeddings")
    
    # STEP 5: Index to ChromaDB
    print("\n4️⃣ Indexing to ChromaDB...")
    vector_store = VectorStore(
        persist_directory=str(config.CHROMA_DB_DIR),
        collection_name="nelson_textbook"
    )
    
    batch_size = 1000
    for i in range(0, len(chunks), batch_size):
        end = min(i + batch_size, len(chunks))
        vector_store.add_chunks(
            texts=[c['text'] for c in chunks[i:end]],
            embeddings=embeddings[i:end],
            metadatas=[c['metadata'] for c in chunks[i:end]],
            ids=[c['id'] for c in chunks[i:end]]
        )
        print(f"   📦 {end}/{len(chunks)}")
    
    print("\n" + "="*70)
    print("✅ INDEXING COMPLETE!")
    print("="*70)
    print(f"Pages processed: {len(pages)}")
    print(f"Sections found: {len(sections)}")
    print(f"Chunks indexed: {len(chunks)}")
    print(f"Collection: nelson_textbook")
    print(f"Location: {config.CHROMA_DB_DIR}")
    print("="*70 + "\n")


if __name__ == "__main__":
    import argparse
    
    p = argparse.ArgumentParser()
    p.add_argument("--pdf", required=True, help="Path to Nelson PDF")
    p.add_argument("--save-json", default="data/nelson_pages.json", help="Save extracted pages")
    p.add_argument("--use-saved", action="store_true", help="Use saved JSON")
    
    args = p.parse_args()
    main(args.pdf, args.save_json, args.use_saved)