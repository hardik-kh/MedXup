# MedXup

### AI-assisted pediatric clinical screening and decision support

MedXup helps healthcare professionals convert pediatric screening data into structured, evidence-informed clinical reports. It combines guided data collection, pediatric reference retrieval, medicine dosing information, research evidence, and Azure OpenAI-generated analysis in a single workflow.

> **Clinical notice:** MedXup is a clinical decision-support prototype. It is intended for qualified healthcare professionals and does not replace independent clinical judgement.

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [API documentation](#api-documentation)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

## Overview

Pediatric assessment requires clinicians to interpret age-dependent vital signs, symptoms, medicine guidance, and supporting evidence under time pressure. MedXup provides a consistent workflow for collecting this information and generating a concise report for clinical review.

The application:

1. Collects patient demographics, measurements, vital signs, symptoms, and relevant history.
2. Converts the presentation into focused clinical and medicine queries.
3. Searches locally indexed pediatric reference material using hybrid retrieval.
4. Looks up relevant BNF for Children dosing rows.
5. Optionally retrieves research literature for complex presentations.
6. Reranks the evidence and sends the assembled context to Azure OpenAI.
7. Streams a structured clinical report to the browser for review and PDF export.

MedXup is designed for clinicians, healthcare researchers, and developers evaluating retrieval-augmented generation in pediatric decision-support workflows.

## Features

- Guided, multi-step pediatric screening workflow
- Demographic, anthropometric, vital-sign, symptom, and history capture
- Multilingual voice-assisted symptom collection
- Hybrid BM25 and PubMedBERT semantic retrieval
- Nelson textbook retrieval through a local ChromaDB index
- Structured BNF for Children medicine and dosage lookup
- Complexity-based research retrieval through Qdrant
- Cross-encoder evidence reranking
- Azure OpenAI-powered clinical report generation
- Real-time NDJSON report streaming
- Evidence and research-source display
- Browser-generated PDF reports
- Clinician rating and feedback collection

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Tailwind CSS, Radix UI |
| Report rendering | React Markdown, remark-gfm, jsPDF |
| Voice interface | Web Speech API, Azure OpenAI |
| Backend | Python, FastAPI, Pydantic, Uvicorn |
| LLM integration | Azure OpenAI SDK |
| Embeddings | Sentence Transformers, PubMedBERT, PyTorch |
| Retrieval | BM25, ChromaDB, Qdrant |
| Reranking | Cross-encoder models |
| Document processing | PyPDF2, pdfplumber, Azure Document Intelligence |

## Installation

### Prerequisites

Install the following before starting:

- Python 3.10 or 3.11
- Node.js 18 or newer
- npm 9 or newer
- An Azure OpenAI resource and model deployment
- A Nelson textbook ChromaDB index
- A structured BNF for Children dosing workbook
- A Qdrant instance and research collection if research retrieval is required

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/medxup.git
cd medxup
```

### 2. Create the backend environment

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS or Linux:

```bash
source .venv/bin/activate
```

Install the backend dependencies:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install openpyxl tiktoken qdrant-client azure-ai-formrecognizer azure-core
```

### 3. Add the local clinical resources

Place the Nelson vector index and BNFC dosing workbook in the following locations:

```text
backend/data/chroma_db_nelson/
backend/data/merged_drug_table.xlsx
```

The BNF for Children reference used by the project is available here:

[BNF for Children](https://drive.google.com/file/d/1GOe0-RFTVDtvr7Ffbb6EMFUw3jvMmHx6/view?usp=sharing)

### 4. Configure the backend

Create `backend/.env` using the example in the [Configuration](#configuration) section.

### 5. Install the frontend

```bash
cd ../frontend
npm ci
```

## Usage

### Development mode

Start the backend from the `backend` directory:

```bash
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies local API requests to `http://127.0.0.1:8000`.

### Screening workflow

1. Open the application and begin a new screening.
2. Enter the patient's information, measurements, and vital signs.
3. Describe the presenting symptoms or use the voice assistant.
4. Add relevant allergies, medicines, previous conditions, and vaccination history.
5. Submit the screening and review the report as it streams into the page.
6. Review the evidence, export the report as a PDF, and provide feedback.

### Production build

Build the frontend:

```bash
cd frontend
npm ci
npm run build
```

Start the combined application from the backend directory:

```bash
cd ../backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, FastAPI serves the compiled frontend and API from the same application.

## Configuration

Create `backend/.env` with the following values:

```dotenv
# Required: Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Optional: Azure Document Intelligence for PDF extraction
AZURE_DOC_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_DOC_INTELLIGENCE_KEY=your-document-intelligence-key

# Optional: research retrieval
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=pediatric_research
```

| Variable | Required | Description |
| --- | --- | --- |
| `AZURE_OPENAI_ENDPOINT` | Yes | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI API credential |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Yes | Chat model deployment used by the pipeline |
| `AZURE_OPENAI_API_VERSION` | Yes | Azure OpenAI API version |
| `AZURE_DOC_INTELLIGENCE_ENDPOINT` | No | Document Intelligence resource endpoint |
| `AZURE_DOC_INTELLIGENCE_KEY` | No | Document Intelligence API credential |
| `QDRANT_URL` | No | Qdrant server URL; defaults to `http://localhost:6333` |
| `QDRANT_COLLECTION` | No | Research collection; defaults to `pediatric_research` |

The frontend uses relative API paths. No Azure credentials are required by the browser application.

## Project structure

```text
medxup/
├── backend/
│   ├── app.py                       # FastAPI application and route definitions
│   ├── config.py                    # Models, paths, prompts, and retrieval settings
│   ├── requirements.txt             # Python dependency definitions
│   ├── setup_and_index.py           # Dataset setup and indexing utility
│   ├── scripts/
│   │   ├── index_bnf.py             # BNF indexing utility
│   │   ├── index_nelson.py          # Nelson indexing utility
│   │   └── test_nelson_search.py    # Manual Nelson retrieval check
│   ├── data/                        # Local workbooks, datasets, and vector indexes
│   └── src/
│       ├── clinical_analyzer.py     # Patient preprocessing and pipeline orchestration
│       ├── rag_engine.py            # Retrieval, context building, and LLM generation
│       ├── query_processor.py       # Clinical queries and complexity scoring
│       ├── hybrid_retriever.py      # BM25 and semantic result fusion
│       ├── qdrant_retriever.py      # Research-paper retrieval
│       ├── drug_table_lookup.py     # Structured BNFC lookup
│       ├── embedding_service.py     # Embedding model wrapper
│       ├── reranker.py              # Cross-encoder reranking
│       ├── vector_store.py          # ChromaDB abstraction
│       └── extractors/              # PDF extraction and parsing
├── frontend/
│   ├── public/                      # Static assets
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/              # Shared application layout
│   │   │   ├── report/              # Clinical report presentation and PDF export
│   │   │   ├── ui/                  # Reusable interface components
│   │   │   └── voice/               # Voice-assistant interface
│   │   ├── pages/                   # Application routes and workflows
│   │   ├── hooks/                   # Shared React hooks
│   │   └── lib/                     # Session, report, and utility helpers
│   ├── package.json
│   └── vite.config.ts
├── reports/                         # Locally generated PDF reports
├── feedback.csv                     # Locally collected report feedback
└── README.md
```

## API documentation

Interactive OpenAPI documentation is available while the backend is running:

- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- OpenAPI schema: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns service health and indexed-document counts |
| `GET` | `/stats` | Returns retrieval models, databases, and configuration statistics |
| `POST` | `/analyze` | Runs a complete non-streaming patient analysis |
| `POST` | `/analyze-stream` | Streams analysis metadata and content as NDJSON |
| `POST` | `/voice-llm` | Processes a voice-assistant conversation turn |
| `POST` | `/save-report` | Stores a base64-encoded PDF report |
| `POST` | `/submit-feedback` | Creates or updates clinician feedback for a report |

### Analyze a patient

`POST /analyze`

```bash
curl -X POST http://127.0.0.1:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Patient",
    "age": 7,
    "sex": "Female",
    "weight": 24.5,
    "height": 122,
    "spo2": 97,
    "temp": 38.2,
    "hr": 105,
    "bp_sys": 102,
    "bp_dia": 66,
    "symptoms": "Fever, sore throat, and reduced appetite for two days"
  }'
```

Example response:

```json
{
  "success": true,
  "patient_data": {
    "name": "Example Patient",
    "age": 7,
    "sex": "Female",
    "bmi": 16.5,
    "bmi_cat": "Underweight",
    "bp": "102.0/66.0"
  },
  "analysis": "## 1. **POSSIBLE CONDITIONS**\n...",
  "retrieved_sources": [],
  "query_used": "Pediatric fever and sore throat...",
  "timestamp": "2026-08-20T14:30:00.000000"
}
```

### Stream an analysis

`POST /analyze-stream` accepts the same patient payload and returns newline-delimited JSON:

```text
{"type":"meta","retrieved_sources":[],"query_used":"Pediatric fever and sore throat..."}
{"type":"chunk","text":"## 1. **POSSIBLE CONDITIONS**"}
{"type":"chunk","text":"\n### Quick view\n..."}
{"type":"done"}
```

### Voice assistant request

`POST /voice-llm`

```json
{
  "language_code": "en-GB",
  "screening_context": {
    "age": "7",
    "sex": "Female",
    "temperature": "38.2"
  },
  "messages": [
    {
      "role": "user",
      "content": "She has had a sore throat since yesterday."
    }
  ]
}
```

Example response:

```json
{
  "content": "Is she having difficulty swallowing fluids?"
}
```

### Validation rules

The patient analysis endpoints accept:

| Field | Type | Constraints |
| --- | --- | --- |
| `name` | String | Required |
| `age` | Number | Required; between 0 and 18 years |
| `sex` | String | Required |
| `weight` | Number or `null` | Greater than 0 when provided |
| `height` | Number or `null` | Greater than 0 when provided |
| `spo2` | Number or `null` | Between 0 and 100 when provided |
| `temp` | Number or `null` | Optional temperature in Celsius |
| `hr` | Number or `null` | Greater than 0 when provided |
| `bp_sys` | Number or `null` | Optional systolic blood pressure |
| `bp_dia` | Number or `null` | Optional diastolic blood pressure |
| `symptoms` | String | Required clinical presentation |

## Contributing

Contributions are welcome through focused issues and pull requests.

1. Fork the repository.
2. Create a branch from `main`:

   ```bash
   git checkout -b feature/short-description
   ```

3. Make a focused change and include appropriate tests or documentation.
4. Run the available checks:

   ```bash
   python -m compileall -q backend
   cd frontend
   npm exec tsc -- --noEmit
   npm run lint
   npm run build
   ```

5. Commit using a clear message:

   ```bash
   git commit -m "Add concise description of the change"
   ```

6. Push the branch and open a pull request.

For clinical logic, medicine guidance, thresholds, or report wording, include the supporting guideline or clinical reference in the pull request.

## Roadmap

- Expand automated unit, API, frontend, and integration test coverage
- Add reproducible dataset and vector-index preparation workflows
- Introduce retrieval-quality and clinical-output evaluation suites
- Consolidate and lock backend integration dependencies
- Improve streamed-response resilience and error recovery
- Add configurable clinical guideline profiles
- Improve report versioning and longitudinal comparison
- Add containerized local and production deployment
- Add CI checks for type safety, linting, builds, and dependency review

