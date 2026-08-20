#!/usr/bin/env python3
"""
Setup and index research papers (JSON metadata) into ChromaDB research database.
Nelson and BNF are indexed separately via reindex_nelson.py / reindex_bnf.py.
"""

import sys
import time
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent))

from src.document_processor import DocumentProcessor
from src.embedding_service import EmbeddingService
from src.vector_store import VectorStore
import config


def validate_environment():
    """Validate required directories and JSON files exist"""
    print("Validating environment...")

    raw_json_dir = config.DATA_DIR / "raw_json"
    raw_json_dir.mkdir(parents=True, exist_ok=True)

    json_files = list(raw_json_dir.glob("*.json"))
    if not json_files:
        print(f"\n⚠️  No JSON files found in {raw_json_dir}")
        print(f"   Add research paper JSON files there and retry.")
        return False, raw_json_dir

    print(f"✓ Found {len(json_files)} JSON file(s)")
    return True, raw_json_dir


def main():
    print("=" * 70)
    print("MedXup - Research Papers Indexing")
    print("=" * 70)

    valid, raw_json_dir = validate_environment()
    if not valid:
        sys.exit(1)

    # ------------------------------------------------------------------ #
    # STEP 1: Process JSON files
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("STEP 1: Processing JSON Metadata Files")
    print("=" * 70)

    processor = DocumentProcessor(max_tokens=512)

    all_chunks = []
    start_time = time.time()

    for json_file in sorted(raw_json_dir.glob("*.json")):
        chunks = processor.process_json_file(str(json_file))
        all_chunks.extend(chunks)

    processing_time = time.time() - start_time

    if not all_chunks:
        print("\n❌ No chunks generated. Check your JSON files.")
        sys.exit(1)

    print(f"✓ {len(all_chunks)} chunks in {processing_time:.2f}s")

    # ------------------------------------------------------------------ #
    # STEP 2: Generate Embeddings
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("STEP 2: Generating Embeddings")
    print("=" * 70)

    embedding_service = EmbeddingService(model_name=config.MODELS["embedder"])

    texts = [chunk["text"] for chunk in all_chunks]

    start_time = time.time()
    embeddings = embedding_service.encode_batch(texts, batch_size=128)
    embedding_time = time.time() - start_time

    print(f"✓ Embeddings done in {embedding_time:.2f}s")

    # ------------------------------------------------------------------ #
    # STEP 3: Index into ChromaDB (research DB)
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("STEP 3: Indexing into ChromaDB (research)")
    print("=" * 70)

    vector_store = VectorStore(
        persist_directory=str(config.CHROMA_DB_RESEARCH),
        collection_name=config.CHROMA_COLLECTIONS["research"]
    )

    existing_count = vector_store.get_count()
    if existing_count > 0:
        print(f"\n⚠️  Collection already has {existing_count} documents.")
        response = input("(r)eset and reindex, or (a)dd to existing? [r/a]: ").lower()
        if response == "r":
            vector_store.client.delete_collection(config.CHROMA_COLLECTIONS["research"])
            vector_store = VectorStore(
                persist_directory=str(config.CHROMA_DB_RESEARCH),
                collection_name=config.CHROMA_COLLECTIONS["research"]
            )
        elif response != "a":
            print("Invalid choice. Exiting.")
            sys.exit(1)

    start_time = time.time()
    batch_size = 1000

    for i in range(0, len(all_chunks), batch_size):
        batch_chunks = all_chunks[i:i + batch_size]
        batch_embeddings = embeddings[i:i + batch_size]

        vector_store.add_chunks(
            texts=[c["text"] for c in batch_chunks],
            embeddings=batch_embeddings,
            metadatas=[c["metadata"] for c in batch_chunks],
            ids=[c["id"] for c in batch_chunks]
        )
        print(f"  Indexed {min(i + batch_size, len(all_chunks))}/{len(all_chunks)}...")

    indexing_time = time.time() - start_time
    total_time = processing_time + embedding_time + indexing_time

    print(f"\n✓ Final count: {vector_store.get_count()} documents")

    # ------------------------------------------------------------------ #
    # SUMMARY
    # ------------------------------------------------------------------ #
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Chunks indexed:   {len(all_chunks)}")
    print(f"Processing:       {processing_time:.2f}s")
    print(f"Embedding:        {embedding_time:.2f}s")
    print(f"Indexing:         {indexing_time:.2f}s")
    print(f"Total:            {total_time:.2f}s")
    print(f"\n✅ Research DB ready at: {config.CHROMA_DB_RESEARCH}")
    print("Run the API:  python app.py\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted.")
        sys.exit(1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
