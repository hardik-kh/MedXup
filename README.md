# MedXup

MedXup is an AI-assisted pediatric clinical decision-support platform designed to help clinicians turn patient screening information into structured, evidence-informed reports.

The application combines pediatric reference material, medicine dosing information, research retrieval, and large language models to support rapid clinical review. It includes a guided screening workflow, multilingual voice input, streamed analysis, evidence summaries, and PDF report generation.

> MedXup is intended to support qualified healthcare professionals. It does not replace clinical judgement, diagnosis, or treatment decisions.

## Key capabilities

- Guided pediatric patient screening
- Collection of measurements, vital signs, symptoms, and clinical history
- Multilingual voice-assisted symptom capture
- Hybrid semantic and keyword search across pediatric reference content
- Structured BNF for Children medicine and dosage lookup
- Research-paper retrieval for complex presentations
- Evidence-informed clinical report generation with Azure OpenAI
- Real-time report streaming
- PDF export and clinician feedback collection

## Technology stack

### Frontend

- React 18 and TypeScript
- Vite
- Tailwind CSS
- Radix UI
- React Router
- React Markdown
- jsPDF

### Backend

- Python and FastAPI
- Azure OpenAI
- Sentence Transformers and PyTorch
- ChromaDB
- Qdrant
- BM25 retrieval
- Cross-encoder reranking

## Clinical reference

[Access BNF for Children](https://drive.google.com/file/d/1GOe0-RFTVDtvr7Ffbb6EMFUw3jvMmHx6/view?usp=sharing)

## Project structure

```text
medxup-complete-project/
├── backend/
│   ├── app.py                  # FastAPI application and routes
│   ├── config.py               # Application and model configuration
│   ├── requirements.txt        # Python dependencies
│   ├── scripts/                # Indexing and retrieval utilities
│   ├── data/                   # Local datasets and vector indexes
│   └── src/
│       ├── clinical_analyzer.py
│       ├── rag_engine.py
│       ├── query_processor.py
│       ├── hybrid_retriever.py
│       ├── qdrant_retriever.py
│       ├── drug_table_lookup.py
│       └── extractors/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- Azure OpenAI endpoint, API key, and deployment
- Nelson textbook vector index
- BNF for Children dosing workbook
- Qdrant instance for research retrieval (optional)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

### 2. Configure the backend

```bash
cd backend
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Activate it on macOS or Linux:

```bash
source .venv/bin/activate
```

Install the Python dependencies:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install openpyxl tiktoken qdrant-client azure-ai-formrecognizer azure-core
```

Create `backend/.env`:

```dotenv
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview

AZURE_DOC_INTELLIGENCE_ENDPOINT=
AZURE_DOC_INTELLIGENCE_KEY=

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=pediatric_research
```

Place the required local resources at:

```text
backend/data/chroma_db_nelson/
backend/data/merged_drug_table.xlsx
```

### 3. Start the backend

```bash
cd backend
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

FastAPI documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 4. Configure the frontend

Open another terminal:

```bash
cd frontend
npm ci
npm run dev
```

The application is available at [http://localhost:5173](http://localhost:5173).

## Production build

Build the frontend:

```bash
cd frontend
npm ci
npm run build
```

Start the backend from the project root:

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000
```

FastAPI automatically serves the compiled frontend when `frontend/dist` is present.

## API endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns application and index status |
| `GET` | `/stats` | Returns retrieval-system statistics |
| `POST` | `/analyze` | Generates a complete clinical analysis |
| `POST` | `/analyze-stream` | Streams a clinical analysis as NDJSON |
| `POST` | `/voice-llm` | Processes voice-assistant conversation turns |
| `POST` | `/save-report` | Saves a generated PDF report |
| `POST` | `/submit-feedback` | Saves or updates clinician feedback |

## Development commands

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
```

Backend:

```bash
cd backend
python -m compileall -q .
uvicorn app:app --reload
```

## Application workflow

1. Enter the patient's demographic information and measurements.
2. Record vital signs, symptoms, and relevant history.
3. Use the optional voice assistant to capture symptoms conversationally.
4. Submit the screening for clinical analysis.
5. Review the streamed report, supporting evidence, and recommendations.
6. Export the report as a PDF and submit clinician feedback.

