import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Project paths
PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / "data"
PDF_DIR = DATA_DIR / "raw_pdfs"

# ChromaDB directory for Nelson
CHROMA_DB_NELSON = DATA_DIR / "chroma_db_nelson"

# Qdrant — research paper search (complexity >= 7 cases)
QDRANT_CONFIG = {
    "url":        os.getenv("QDRANT_URL", "http://localhost:6333"),
    "collection": os.getenv("QDRANT_COLLECTION", "pediatric_research"),
    "fetch_k":    10,   # candidates fetched from Qdrant
    "final_k":    3,    # papers returned after quality scoring
}

# BNF Drug Table (replaces BNF vector store)
BNF_DRUG_TABLE_PATH = DATA_DIR / "merged_drug_table.xlsx"

# Ensure directories exist
PDF_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DB_NELSON.mkdir(parents=True, exist_ok=True)

# Azure OpenAI Configuration
AZURE_CONFIG = {
    "endpoint": os.getenv("AZURE_OPENAI_ENDPOINT"),
    "api_key": os.getenv("AZURE_OPENAI_API_KEY"),
    "deployment_name": os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
    "api_version": os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
}

# Embedding Configuration
EMBEDDING_MODEL = "pritamdeka/S-PubMedBert-MS-MARCO"
EMBEDDING_DIMENSION = 768  # PubMedBERT dimension

# Chunking Configuration
CHUNKING_CONFIG = {
    "min_chunk_size": 300,      # Minimum tokens per chunk
    "max_chunk_size": 800,      # Maximum tokens per chunk
    "overlap": 150,             # Token overlap between chunks
    "respect_sentences": True,  # Don't split mid-sentence
}

# ChromaDB Configuration
CHROMA_COLLECTIONS = {
    "nelson": "nelson_textbook",
}

# RAG Configuration
RAG_CONFIG = {
    # Retrieval settings
    "initial_top_k": 15,             # Fetch more candidates initially
    "final_top_k": 5,                # Final results after reranking
    "reasoning_effort": "none",      # Lowest-latency GPT-5.4-mini mode
    "max_completion_tokens": 4000,   # Includes visible output and reasoning tokens
    
    # Complexity-based routing
    "complexity_thresholds": {
        "low": (0, 6),      # Routine cases: Nelson + Dosage only
        "high": (7, 10)     # Complex cases: Nelson + Dosage + Research
    },
    
    # Hybrid search weights (BM25 + Semantic)
    "bm25_weight": 0.3,
    "semantic_weight": 0.7,
}

# Settings for the smaller supporting LLM calls.
QUERY_LLM_CONFIG = {
    "reasoning_effort": "none",
    "max_completion_tokens": 500,
}

VOICE_LLM_CONFIG = {
    "reasoning_effort": "none",
    "max_completion_tokens": 800,
}

# Model Configuration
MODELS = {
    "embedder": "pritamdeka/S-PubMedBert-MS-MARCO",
    "reranker": "cross-encoder/ms-marco-MiniLM-L-6-v2",
}

# Clinical Analysis Prompt Template
CLINICAL_PROMPT_TEMPLATE = """You are a pediatric medical expert providing clinical decision support.

PATIENT INFORMATION:
- Name: {name}
- Age: {age} years
- Sex: {sex}
- Weight: {weight} kg
- Height: {height} cm
- BMI: {bmi} ({bmi_cat})
- Vital Signs:
  - SpO2: {spo2}%
  - Temperature: {temp}°C
  - Heart Rate: {hr} bpm
  - Blood Pressure: {bp}

PRESENTING SYMPTOMS:
{symptoms}

RELEVANT MEDICAL LITERATURE:
{context}

Create a layered clinical report for a doctor in one response. Follow these output rules exactly:

- Return only the four sections below, in the same order and with the exact headings.
- The Quick view content across all four sections should be about 450-550 words.
- Clinical detail should add only 20-30% more information; keep the complete response under 750 visible words.
- Start every bullet with a short **bold keyword or phrase:** followed by concise clinical information.
- Do not include an introduction, conclusion, summary, repeated plan, references section, disclaimer, or follow-up offer.
- Do not repeat medication doses or the same recommendation across sections.
- Do not mention a treatment merely because it appears in the literature. Include it only when relevant to this patient's presentation.
- Under every numbered section, output `### Quick view` first and then `### Clinical detail`.
- Quick view must contain the fast, actionable summary used in the four dashboard cards.
- Clinical detail must add only 1 concise bullet with useful nuance, justification, or contingency that is not already stated in Quick view.

## 1. **POSSIBLE CONDITIONS**
### Quick view
- Give no more than 3 likely diagnoses.
- Use one bullet per diagnosis with one short rationale sentence.
- Order diagnoses from most to least likely.
### Clinical detail
- Add 1 concise bullet explaining the key diagnostic uncertainty or discriminator.

## 2. **MEDICATION GUIDANCE**
### Quick view
- Include only immediately relevant first-line treatment and, when clinically useful, one alternative.
- For each medication, state the drug, patient-specific dose, route/frequency, and one essential safety warning compactly.
- If a matching row for that drug exists in the supplied BNF dosing table, keep the current medication format unchanged and select the age/weight-appropriate row precisely.
- If no matching row for that drug exists in the supplied BNF dosing table, provide the best age-appropriate dose supported by your knowledge and NICE/European guidance, then append exactly `(Not BNFC-verified)` after the dosage. Do not use this label when a matching drug row exists.
- Do not provide conditional antibiotic, antiviral, or other prescription regimens unless the current presentation supports their use.
- If medication is not indicated, state that briefly instead of listing hypothetical options.
### Clinical detail
- Add 1 concise bullet covering the most important prescribing nuance or contingency without repeating a dose.

## 3. **NEXT STEPS**
### Quick view
- Give no more than 5 prioritized bullets covering immediate action, necessary investigation, monitoring, and follow-up.
- Do not repeat medication dosing from the medication section.
### Clinical detail
- Add 1 concise bullet explaining when the investigation or follow-up plan should change.

## 4. **RED FLAGS**
### Quick view
- Give no more than 6 prioritized bullets.
- Combine related warning signs and clearly state when urgent or emergency escalation is required.
### Clinical detail
- Add 1 concise bullet clarifying the most important escalation threshold or safety-netting nuance.

Focus on evidence-based, age-appropriate pediatric care and make every bullet useful for rapid clinical review.

GUIDELINES PREFERENCE: Where multiple guideline options exist, prefer NICE (UK) and European guidelines over US-specific guidelines. For drug choices, follow BNF for Children and NICE recommendations as primary reference, using Nelson as supporting evidence.
"""

# Validation
def validate_config():
    """Validate that all required configuration is present"""
    errors = []
    
    if not AZURE_CONFIG["endpoint"]:
        errors.append("AZURE_OPENAI_ENDPOINT not set")
    if not AZURE_CONFIG["api_key"]:
        errors.append("AZURE_OPENAI_API_KEY not set")
    if not AZURE_CONFIG["deployment_name"]:
        errors.append("AZURE_OPENAI_DEPLOYMENT_NAME not set")
    
    if errors:
        raise ValueError(f"Configuration errors: {', '.join(errors)}")
    
    return True

if __name__ == "__main__":
    # Test configuration
    try:
        validate_config()
        print("✅ Configuration valid!")
        print(f"📁 PDF Directory: {PDF_DIR}")
        print(f"📁 Nelson DB: {CHROMA_DB_NELSON}")
        print(f"📋 BNF Drug Table: {BNF_DRUG_TABLE_PATH}")
        print(f"🤖 Azure OpenAI Endpoint: {AZURE_CONFIG['endpoint'][:50]}...")
    except ValueError as e:
        print(f"❌ {e}")
