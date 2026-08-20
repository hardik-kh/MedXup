"""
RAG Engine - Multi-Database Hybrid Search Pipeline
Orchestrates query processing, retrieval, and reranking across multiple medical databases
"""

from typing import Dict, List
from src.query_processor import QueryProcessor
from src.hybrid_retriever import HybridRetriever
from src.reranker import Reranker
from src.vector_store import VectorStore
from src.embedding_service import EmbeddingService
from src.drug_table_lookup import DrugTableLookup
from src.qdrant_retriever import QdrantRetriever
from openai import AzureOpenAI
import config
import tiktoken
import time


def _print_timing(label: str, started_at: float) -> None:
    """Print a consistently formatted elapsed-time measurement."""
    elapsed = time.perf_counter() - started_at
    print(f"[TIMING] {label}: {elapsed:.2f}s", flush=True)

class RAGEngine:
    """Advanced RAG engine with multi-DB hybrid search"""
    
    def __init__(self, azure_config: Dict):
        """
        Initialize RAG engine with all components
        
        Args:
            azure_config: Azure OpenAI configuration
        """
        print("\n🚀 Initializing Advanced RAG Pipeline...")
        
        # Azure OpenAI client
        self.client = AzureOpenAI(
            api_key=azure_config["api_key"],
            api_version=azure_config["api_version"],
            azure_endpoint=azure_config["endpoint"]
        )
        self.deployment_name = azure_config["deployment_name"]
        
        # Query processor (complexity scoring)
        self.query_processor = QueryProcessor(
            azure_config=azure_config
        )
        
        # Initialize embedding service (shared across all DBs)
        self.embedding_service = EmbeddingService(config.MODELS["embedder"])
        
        # Initialize vector store (Nelson only — Research via Qdrant when integrated)
        print("\n📚 Loading databases...")
        self.vector_stores = {
            "nelson": VectorStore(
                persist_directory=str(config.CHROMA_DB_NELSON),
                collection_name=config.CHROMA_COLLECTIONS["nelson"]
            ),
        }

        # Initialize hybrid retriever for Nelson
        print("\n🔍 Initializing hybrid search...")
        self.retrievers = {
            name: HybridRetriever(
                vector_store=vs,
                embedding_service=self.embedding_service,
                bm25_weight=config.RAG_CONFIG["bm25_weight"],
                semantic_weight=config.RAG_CONFIG["semantic_weight"]
            )
            for name, vs in self.vector_stores.items()
        }

        # CrossEncoder reranker (Nelson + Research only)
        self.reranker = Reranker(model_name=config.MODELS["reranker"])
        self.tokenizer = tiktoken.encoding_for_model("gpt-4")

        # BNF Drug Table lookup (replaces BNF vector store)
        self.drug_lookup = DrugTableLookup(str(config.BNF_DRUG_TABLE_PATH))

        # Qdrant research retriever — used for complexity >= 7 cases
        # Shares the existing PubMedBERT embedding service (no second model load)
        try:
            self.qdrant_retriever = QdrantRetriever(
                qdrant_url=config.QDRANT_CONFIG["url"],
                collection=config.QDRANT_CONFIG["collection"],
                embedding_service=self.embedding_service,
                fetch_k=config.QDRANT_CONFIG["fetch_k"],
                final_k=config.QDRANT_CONFIG["final_k"],
            )
            print("   ✓ Qdrant research retriever ready")
        except Exception as e:
            print(f"   ⚠️  Qdrant unavailable ({e}) — research search disabled")
            self.qdrant_retriever = None

        print("\n✅ RAG Pipeline Ready!\n")
    
    def analyze_patient(self, patient_data: Dict, prompt_template: str) -> Dict:
        """
        Complete RAG pipeline for patient analysis
        
        Pipeline:
        1. Process query (generate clinical query + complexity score)
        2. Route to appropriate databases based on complexity
        3. Hybrid search (BM25 + semantic) in each DB
        4. Rerank results per DB using CrossEncoder
        5. Generate clinical response with LLM
        
        Args:
            patient_data: Patient information
            prompt_template: Prompt template for LLM
            
        Returns:
            Dict with analysis, sources, and metadata
        """

        print("\n" + "="*70)
        print("🏥 CLINICAL ANALYSIS PIPELINE")
        print("="*70)
        
        # Step 1: Process query
        print("\n1️⃣ Processing query...")
        query_result = self.query_processor.process_query(patient_data)
        
        clinical_query = query_result["clinical_query"]
        # Reserved for a future dedicated dosage search. The current table
        # lookup uses drug_names and clinical_query.
        dosage_query = query_result["dosage_query"]
        drug_names = query_result["drug_names"]
        complexity_score = query_result["complexity_score"]
        
        print(f"   Clinical Query: {clinical_query}")
        print(f"   Complexity Score: {complexity_score}/10")
        
        # Step 2: Determine which DBs to search
        use_research = self.query_processor.should_use_research(complexity_score)

        dbs_to_search = ["nelson", "dosage"]
        if use_research and self.qdrant_retriever:
            dbs_to_search.append("research")
            print(f"   🔬 Complex case (score {complexity_score}) — including Qdrant research papers")
        else:
            print(f"   📘 Routine case — textbook + dosage only")

        # Step 3a: BNF Drug Table lookup (exact + BM25)
        print("\n2️⃣ BNF Drug Table lookup...")
        dosage_context = self.drug_lookup.lookup(
            drug_names=drug_names,
            clinical_query=clinical_query,
            symptom_top_k=10
        )
        dosage_tokens = len(self.tokenizer.encode(dosage_context))
        print(f"   ✓ dosage: {dosage_tokens} tokens")
        self._save_dosage_debug(dosage_context, drug_names, clinical_query)

        # Step 3b: Hybrid search for Nelson
        print("\n3️⃣ Hybrid search (BM25 + Semantic)...")
        all_results = {}
        print(f"   Searching nelson...")
        results = self.retrievers["nelson"].search(query=clinical_query, top_k=10)
        all_results["nelson"] = results
        print(f"   ✓ nelson: {len(results)} results")

        # Step 3c: Qdrant research search (complex cases only)
        if "research" in dbs_to_search:
            print(f"   Searching Qdrant research papers...")
            research_results = self.qdrant_retriever.search(clinical_query)
            all_results["research"] = research_results
            print(f"   ✓ research: {len(research_results)} papers")

        # Step 4: Rerank Nelson + Research with CrossEncoder
        print("\n4️⃣ Reranking with CrossEncoder...")
        reranked_results = self.reranker.rerank_batched(
            query=clinical_query,
            results_dict=all_results,
            top_k_per_source=config.RAG_CONFIG["final_top_k"]
        )
        for db_name, results in reranked_results.items():
            print(f"   ✓ {db_name}: top {len(results)} selected")
        
        # Step 5: Build context
        print("\n5️⃣ Building context...")
        context_string = self._format_context(reranked_results, dosage_context)

        # Token counts
        print("\n📊 Token counts:")
        print(f"   dosage (BNF table): {dosage_tokens} tokens")
        for db_name, results in reranked_results.items():
            db_tokens = sum(len(self.tokenizer.encode(r['text'])) for r in results)
            print(f"   {db_name}: {db_tokens} tokens ({len(results)} chunks)")
        context_tokens = len(self.tokenizer.encode(context_string))
        print(f"   TOTAL CONTEXT: {context_tokens} tokens")
        
        # Step 6: Generate clinical analysis
        print("\n6️⃣ Generating clinical analysis...")
        
        formatted_prompt = prompt_template.format(
            name=patient_data.get("name", "Unknown"),
            age=patient_data.get("age", "Not provided"),
            sex=patient_data.get("sex", "Not specified"),
            weight=patient_data.get("weight", "Not provided"),
            height=patient_data.get("height", "Not provided"),
            bmi=patient_data.get("bmi", "Not calculated"),
            bmi_cat=patient_data.get("bmi_cat", "Unknown"),
            spo2=patient_data.get("spo2", "Not provided"),
            temp=patient_data.get("temp", "Not provided"),
            hr=patient_data.get("hr", "Not provided"),
            bp=patient_data.get("bp", "Not provided"),
            symptoms=patient_data.get("symptoms", "No symptoms provided"),
            context=context_string
        )
        
        system_message = (
            "You are an expert pediatric clinical decision support system. "
            "Provide evidence-based recommendations suitable for pediatric patients. "
            "Be precise, clear, and always consider age-appropriate care."
        )

        prompt_tokens = len(self.tokenizer.encode(formatted_prompt))
        print(f"   📤 SENDING TO LLM: {prompt_tokens} tokens")

        self._save_full_context_debug(
            reranked_results, dosage_context, context_string,
            clinical_query, complexity_score, prompt_tokens, formatted_prompt
        )

        analysis = self._generate_response(formatted_prompt, system_message)
        analysis = self._sanitize_text(analysis)
        
        print("   ✅ Analysis complete")
        
        # Step 7: Build response
        print("\n" + "="*70)
        print("✅ PIPELINE COMPLETE")
        print("="*70 + "\n")
        
        return {
            "analysis": analysis,
            "retrieved_sources": self._format_sources(reranked_results),
            "query_used": clinical_query,
            "complexity_score": complexity_score,
            "databases_searched": dbs_to_search
        }

    def _save_dosage_debug(self, dosage_context: str, drug_names: List[str], clinical_query: str) -> None:
        """Save dosage table sent to LLM to a txt file for inspection."""
        from pathlib import Path
        output_path = Path(__file__).parent / "data" / "debug_dosage_table.txt"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("=" * 70 + "\n")
            f.write("📋 BNF DOSAGE TABLE SENT TO LLM\n")
            f.write("=" * 70 + "\n\n")
            f.write(f"Drug names searched : {drug_names}\n")
            f.write(f"Clinical query      : {clinical_query}\n")
            f.write("\n" + "-" * 70 + "\n\n")
            f.write(dosage_context)
            f.write("\n" + "=" * 70 + "\n")
        print(f"   💾 Dosage debug saved to: {output_path}")

    def _save_full_context_debug(
        self,
        reranked_results: Dict[str, List[Dict]],
        dosage_context: str,
        context_string: str,
        clinical_query: str,
        complexity_score: int,
        prompt_tokens: int,
        formatted_prompt: str,
    ) -> None:
        """
        Save a complete debug file showing exactly what goes to the LLM.
        Writes the full formatted_prompt verbatim — no truncation.
        Also includes a structured summary of each section.
        """
        from pathlib import Path
        output_path = Path(__file__).parent / "data" / "debug_full_context.txt"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # with open(output_path, "w", encoding="utf-8") as f:

        #     # ── Header ─────────────────────────────────────────────────────
        #     f.write("=" * 70 + "\n")
        #     f.write("🏥 FULL LLM CONTEXT DEBUG\n")
        #     f.write("=" * 70 + "\n\n")
        #     f.write(f"Clinical query   : {clinical_query}\n")
        #     f.write(f"Complexity score : {complexity_score}/10\n")
        #     f.write(f"Total prompt     : {prompt_tokens:,} tokens\n\n")

        #     # ── Section summary ────────────────────────────────────────────
        #     dosage_tokens  = len(self.tokenizer.encode(dosage_context))
        #     nelson_results = reranked_results.get("nelson", [])
        #     nelson_tokens  = sum(len(self.tokenizer.encode(r['text'])) for r in nelson_results)
        #     research_results = reranked_results.get("research", [])
        #     research_tokens  = sum(len(self.tokenizer.encode(r['text'])) for r in research_results)

        #     f.write(f"{'─'*70}\n")
        #     f.write(f"📊 TOKEN SUMMARY\n")
        #     f.write(f"{'─'*70}\n")
        #     f.write(f"  Dosage (BNF)    : {dosage_tokens:,} tokens ({len(dosage_context.splitlines())} lines)\n")
        #     f.write(f"  Nelson chunks   : {nelson_tokens:,} tokens ({len(nelson_results)} chunks)\n")
        #     if research_results:
        #         f.write(f"  Research papers : {research_tokens:,} tokens ({len(research_results)} papers)\n")
        #     f.write(f"  Total context   : {len(self.tokenizer.encode(context_string)):,} tokens\n")
        #     f.write(f"  Full prompt     : {prompt_tokens:,} tokens\n\n")

        #     # ── Research paper details ─────────────────────────────────────
        #     if research_results:
        #         f.write(f"{'─'*70}\n")
        #         f.write(f"🔬 RESEARCH PAPERS INCLUDED\n")
        #         f.write(f"{'─'*70}\n")
        #         for i, r in enumerate(research_results, 1):
        #             m  = r['metadata']
        #             qs = r.get('quality_scores', {})
        #             f.write(f"  Paper {i}:\n")
        #             f.write(f"    Title      : {m.get('title','')}\n")
        #             f.write(f"    Journal    : {m.get('journal','')} ({m.get('year','')})\n")
        #             f.write(f"    Study type : {m.get('study_type','')}\n")
        #             f.write(f"    DOI        : {m.get('doi_url','N/A')}\n")
        #             f.write(f"    Quality    : vector={qs.get('vector',0)}  "
        #                     f"study={qs.get('study',0)}  "
        #                     f"recency={qs.get('recency',0):.2f}  "
        #                     f"final={qs.get('final',0)}\n")
        #             if qs.get('penalty_reason'):
        #                 f.write(f"    ⚠️ Penalty : {qs['penalty_reason']}\n")
        #         f.write("\n")

            # # ── Full prompt verbatim ───────────────────────────────────────
            # f.write(f"{'─'*70}\n")
            # f.write(f"📄 FULL PROMPT SENT TO LLM (verbatim)\n")
            # f.write(f"{'─'*70}\n\n")
            # f.write(formatted_prompt)
            # f.write("\n\n" + "=" * 70 + "\n")

        print(f"   💾 Full context debug saved to: {output_path}")

    def _sanitize_text(self, text: str) -> str:
        """Replace Unicode symbols that break PDF font rendering."""
        replacements = {
            '≥': '>=',
            '≤': '<=',
            '→': '->',
            '←': '<-',
            '±': '+/-',
            '×': 'x',
            '÷': '/',
            '–': '-',   # en dash
            '—': '--',  # em dash
            '’': "'",   # right single quote
            '‘': "'",   # left single quote
            '“': '"',   # left double quote
            '”': '"',   # right double quote
            '•': '-',   # bullet
            '°': ' degrees',  # degree sign
            'µ': 'mcg',  # micro sign
        }
        for char, replacement in replacements.items():
            text = text.replace(char, replacement)
        return text

    def _format_context(self, reranked_results: Dict[str, List[Dict]], dosage_context: str = "") -> str:
        """
        Format retrieved context for LLM prompt.
        Order: BNF dosage → Nelson textbook → Qdrant research papers
        """
        context_parts = []
        source_num = 1

        # 1. BNF Drug Table — always first
        if dosage_context:
            context_parts.append(
                f"[Source {source_num}: BNF for Children — Drug Dosing Table]\n"
                f"{dosage_context}\n"
            )
            source_num += 1

        # 2. Nelson textbook chunks
        if "nelson" in reranked_results:
            for result in reranked_results["nelson"]:
                metadata = result['metadata']
                source_label = f"Nelson Textbook Ch{metadata.get('chapter_number', '?')}"
                context_parts.append(
                    f"[Source {source_num}: {source_label}]\n"
                    f"{result['text']}\n"
                )
                source_num += 1

        # 3. Qdrant research papers (complex cases only)
        if "research" in reranked_results:
            context_parts.append(
                "\nRECENT RESEARCH EVIDENCE:\n"
                "NOTE: Where multiple papers exist, prefer European/high-income "
                "country evidence. Apply BNF/NICE standards to all drug recommendations "
                "regardless of paper origin.\n"
            )
            for result in reranked_results["research"]:
                metadata = result['metadata']
                year      = metadata.get('year', '')
                journal   = metadata.get('journal', '')
                doi_url   = metadata.get('doi_url', '')
                doi_str   = f" | DOI: {doi_url}" if doi_url else ""
                context_parts.append(
                    f"[Source {source_num}: Research — {metadata.get('title', 'Unknown')[:60]} "
                    f"({journal}, {year}){doi_str}]\n"
                    f"{result['text']}\n"
                )
                source_num += 1

        return "\n".join(context_parts)

    def _format_sources(self, reranked_results: Dict[str, List[Dict]]) -> List[Dict]:
        """Format sources for API response — includes DOI links for research papers."""
        formatted_sources = []
        for db_name, results in reranked_results.items():
            for result in results:
                metadata = result['metadata']
                if db_name == "research":
                    formatted_sources.append({
                        "database":     "research",
                        "source":       metadata.get('journal', 'Research'),
                        "title":        metadata.get('title', ''),
                        "journal":      metadata.get('journal', ''),
                        "year":         metadata.get('year', ''),
                        "authors":      metadata.get('authors', []),
                        "doi":          metadata.get('doi', ''),
                        "doi_url":      metadata.get('doi_url', ''),
                        "study_type":   metadata.get('study_type', 'other'),
                        "rerank_score": round(result.get('rerank_score', 0), 4),
                        "preview":      metadata.get('abstract', '')[:200] + "...",
                    })
                else:
                    formatted_sources.append({
                        "database":     db_name,
                        "source":       metadata.get('source', db_name),
                        "chapter":      metadata.get('chapter_number', 'N/A'),
                        "page_start":   metadata.get('page_start', 'N/A'),
                        "page_end":     metadata.get('page_end', 'N/A'),
                        "rerank_score": round(result.get('rerank_score', 0), 4),
                        "preview":      result['text'][:200] + "...",
                    })
        return formatted_sources

    def _generate_response(self, prompt: str, system_message: str) -> str:
        """Generate response using Azure OpenAI"""
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt}
        ]
        try:
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=messages,
                reasoning_effort=config.RAG_CONFIG["reasoning_effort"],
                max_completion_tokens=config.RAG_CONFIG["max_completion_tokens"]
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"❌ Azure OpenAI error: {e}")
            raise

    def _run_pipeline(self, patient_data: Dict):
        """Run full pipeline up to LLM call. Returns (prompt, system_message, sources, query_used)."""
        pipeline_started = time.perf_counter()
        from src.clinical_analyzer import ClinicalAnalyzer
        # Get prompt template from config
        prompt_template = config.CLINICAL_PROMPT_TEMPLATE

        print("\n" + "="*70)
        print("🏥 CLINICAL ANALYSIS PIPELINE (STREAM)")
        print("="*70)

        stage_started = time.perf_counter()
        query_result = self.query_processor.process_query(patient_data)
        _print_timing("1. Query generation + complexity scoring", stage_started)
        clinical_query = query_result["clinical_query"]
        # Reserved for a future dedicated dosage search. The current table
        # lookup uses drug_names and clinical_query.
        dosage_query = query_result["dosage_query"]
        drug_names = query_result["drug_names"]
        complexity_score = query_result["complexity_score"]
        print(f"   Clinical Query: {clinical_query}")
        print(f"   Complexity Score: {complexity_score}/10")

        use_research = self.query_processor.should_use_research(complexity_score)
        dbs_to_search = ["nelson"]
        if use_research and self.qdrant_retriever:
            dbs_to_search.append("research")
            print(f"   🔬 Complex case (score {complexity_score}) — including Qdrant research papers")

        stage_started = time.perf_counter()
        dosage_context = self.drug_lookup.lookup(
            drug_names=drug_names,
            clinical_query=clinical_query,
            symptom_top_k=10
        )
        _print_timing("2. BNF dosage lookup", stage_started)
        print(f"   ✓ dosage: {len(self.tokenizer.encode(dosage_context))} tokens")

        all_results = {}
        stage_started = time.perf_counter()
        results = self.retrievers["nelson"].search(query=clinical_query, top_k=10)
        all_results["nelson"] = results
        _print_timing("3. Nelson hybrid retrieval", stage_started)

        if "research" in dbs_to_search:
            stage_started = time.perf_counter()
            research_results = self.qdrant_retriever.search(clinical_query)
            all_results["research"] = research_results
            print(f"   research: {len(research_results)} papers")
            _print_timing("4. Qdrant research retrieval", stage_started)
        else:
            print("[TIMING] 4. Qdrant research retrieval: skipped", flush=True)

        stage_started = time.perf_counter()
        reranked_results = self.reranker.rerank_batched(
            query=clinical_query,
            results_dict=all_results,
            top_k_per_source=config.RAG_CONFIG["final_top_k"]
        )
        _print_timing("5. CrossEncoder reranking", stage_started)

        stage_started = time.perf_counter()
        context_string = self._format_context(reranked_results, dosage_context)
        _print_timing("6. Context formatting", stage_started)

        stage_started = time.perf_counter()
        formatted_prompt = prompt_template.format(
            name=patient_data.get("name", "Unknown"),
            age=patient_data.get("age", "Not provided"),
            sex=patient_data.get("sex", "Not specified"),
            weight=patient_data.get("weight", "Not provided"),
            height=patient_data.get("height", "Not provided"),
            bmi=patient_data.get("bmi", "Not calculated"),
            bmi_cat=patient_data.get("bmi_cat", "Unknown"),
            spo2=patient_data.get("spo2", "Not provided"),
            temp=patient_data.get("temp", "Not provided"),
            hr=patient_data.get("hr", "Not provided"),
            bp=patient_data.get("bp", "Not provided"),
            symptoms=patient_data.get("symptoms", "No symptoms provided"),
            context=context_string
        )

        system_message = (
            "You are an expert pediatric clinical decision support system. "
            "Provide evidence-based recommendations suitable for pediatric patients. "
            "Be precise, clear, and always consider age-appropriate care."
        )

        sources = self._format_sources(reranked_results)

        prompt_tokens = len(self.tokenizer.encode(formatted_prompt))
        _print_timing("7. Prompt + source preparation", stage_started)
        print(f"   📤 SENDING TO LLM: {prompt_tokens} tokens")
        stage_started = time.perf_counter()
        self._save_full_context_debug(
            reranked_results, dosage_context, context_string,
            clinical_query, complexity_score, prompt_tokens, formatted_prompt
        )
        _print_timing("8. Debug context write", stage_started)
        _print_timing("Pre-LLM pipeline total", pipeline_started)

        return formatted_prompt, system_message, sources, clinical_query

    def _generate_response_stream(self, prompt: str, system_message: str):
        """Generate streaming response using Azure OpenAI"""
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt}
        ]
        request_started = time.perf_counter()
        first_token_received = False
        try:
            stream = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=messages,
                reasoning_effort=config.RAG_CONFIG["reasoning_effort"],
                max_completion_tokens=config.RAG_CONFIG["max_completion_tokens"],
                stream=True
            )
            _print_timing("9. Azure stream connection", request_started)
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    if not first_token_received:
                        first_token_received = True
                        _print_timing("10. Clinical LLM time to first visible token", request_started)
                    yield chunk.choices[0].delta.content
            _print_timing("11. Clinical LLM complete stream", request_started)
        except Exception as e:
            print(f"❌ Azure OpenAI streaming error: {e}")
            raise

    def analyze_patient_stream(self, patient_data: dict):
        """Full pipeline with streaming LLM output. Yields metadata first, then text chunks."""
        import json
        request_started = time.perf_counter()

        # Run full pipeline up to LLM call (same as analyze_patient)
        formatted_prompt, system_message, sources, query_used = self._run_pipeline(patient_data)

        # Yield metadata as first JSON line
        meta = {
            "type": "meta",
            "retrieved_sources": sources,
            "query_used": query_used,
        }
        yield json.dumps(meta) + "\n"

        # Stream LLM response
        for chunk in self._generate_response_stream(formatted_prompt, system_message):
            yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

        _print_timing("TOTAL analyze-stream request", request_started)
        yield json.dumps({"type": "done"}) + "\n"

    def get_system_stats(self) -> Dict:
        """Get statistics about indexed databases"""
        stats = {}
        for db_name, vs in self.vector_stores.items():
            count = vs.get_count()
            stats[db_name] = {
                "total_chunks": count,
                "collection_name": getattr(vs, "collection_name", "unknown")
            }
        stats["dosage"] = {
            "type": "BNF Drug Table (Excel)",
            "total_rows": len(self.drug_lookup.rows),
            "path": str(config.BNF_DRUG_TABLE_PATH)
        }
        if self.qdrant_retriever:
            qdrant_stats = self.qdrant_retriever.get_collection_stats()
            stats["research"] = {
                "type": "Qdrant",
                "total_chunks": qdrant_stats["total_vectors"],
                "collection": qdrant_stats["collection"],
            }
        return stats
