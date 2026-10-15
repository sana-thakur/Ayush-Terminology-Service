# AYUSH Terminology Service (NAMASTE)

**National AYUSH Morbidity and Standardized Terminologies Electronic Portal**

The AYUSH Terminology Service is a robust Node.js application designed to manage, search, and serve standardized terminologies for AYUSH (Ayurveda, Yoga & Naturopathy, Unani, Siddha, and Homeopathy) systems of medicine. It provides a bridge between traditional medicine terms and modern classification systems like ICD-11, facilitating interoperability and standardized reporting.

## 🚀 Key Features

*   **Multi-System Support**: Handles terminologies for Ayurveda, Siddha, and Unani systems.
*   **High-Performance Search**: In-memory search capability for rapid retrieval of terms by code or description, with autocomplete support.
*   **ICD-11 Mapping**: Built-in integration with ICD-11 Traditional Medicine Module 2 (TM2) and Biomedical codes.
*   **FHIR Compatibility**: 
    *   Exposes terminologies as **CodeSystem** resources.
    *   Exposes mappings as **ConceptMap** resources.
    *   Supports the `$translate` operation for semantic interoperability.
    *   Endpoint for ingesting and processing FHIR **Bundles**.
*   **Automated Ingestion**: Scripts to easily import data from CSV files.
*   **Simple UI**: Includes a lightweight frontend for browsing and searching terms.

## 🛠️ Technology Stack

*   **Runtime**: Node.js
*   **Framework**: Express.js
*   **FHIR Client**: `fhir-kit-client`
*   **Data Processing**: `csv-parser`

## 📋 Prerequisites

*   Node.js (v14 or higher recommended)
*   npm (Node Package Manager)

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/shreyashi2609/Ayush-Terminology-Service.git
    cd ayush-terminology-service
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## ⚙️ Data Setup

Before running the service, you need to populate the data. The system expects CSV files containing the terminology data in the root directory.

1.  **Prepare CSV Files**: Ensure you have the following files in the project root:
    *   `Ayurveda.csv`
    *   `Siddha.csv`
    *   `Unani.csv`
    
    *Note: These files should contain columns for ID, Term, Code, and Definitions.*

2.  **Run Ingestion Script**:
    This script parses the CSV files, merges them with ICD-11 mappings (from `models/mappings.json`), and generates a consolidated `search-index.json` in the `data/` directory.
    ```bash
    npm run ingest
    ```
    *You should see a success message indicating the number of terms processed.*

## 🚀 Running the Application

### Development Mode
Runs the server with `nodemon` for hot-reloading.
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port **3000** (default).
Access the web interface at: `http://localhost:3000`

## 📚 API Documentation

### Terminology Endpoints
Base URL: `/api/terminology`

| Method | Endpoint | Description | Query Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/search` | Search for terms with multi-domain & review status filters. | `q` (query), `system` (Ayurveda, Siddha, Unani, all), `status` (verified, flagged, pending_review, unmapped, all), `page`, `limit` |
| `GET` | `/CodeSystem` | Retrieve the FHIR CodeSystem for AYUSH systems. | None |
| `GET` | `/ConceptMap` | Retrieve the FHIR ConceptMap linking AYUSH terms to ICD-11. | None |
| `GET` | `/ConceptMap/$translate` | Translate a code to its ICD-11 equivalent. | `code` (required), `system` (required) |

### Insurance Claims Processor Endpoints
Base URL: `/api/claims`

| Method | Endpoint | Description | Query / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/resolve` | Exact code lookup within a tradition with explicit resolution outcome determination. | `system` (Ayurveda, Siddha, Unani), `code` (e.g. `SID-002`) |
| `GET` | `/search` | Ambiguity resolution search by diagnosis name/term with resolution preview. | `q` (query), `system` (Ayurveda, Siddha, Unani, all), `page`, `limit` |
| `POST` | `/review-requests` | Create a manual medical review request. Prevents duplicate open requests for the same claim reference and concept. | `Body: { claimReference, system, recordId, code, reason, notes, requestedBy }` |

#### Explicit Resolution Outcomes
* **`mapped`**: Both WHO ICD-11 TM2 and Biomedical crosswalks present, and clinically verified by an administrator.
* **`unmapped`**: Recognized term, but ICD-11 TM2 is missing (`N/A`). Requires manual medical review.
* **`partially_mapped`**: One crosswalk missing (e.g., TM2 present, Biomed missing).
* **`unverified`**: Both crosswalks present, but administrator verification is pending.
* **`flagged`**: Terminology mapping was flagged by an administrator with clinical remediation details.
* **`invalid_code`**: Malformed or missing system/code query parameter.
* **`unrecognized_code`**: Code not found within the specified medical tradition.

### Healthcare Administrator Endpoints
Base URL: `/api/admin` *(Protected by Admin Auth Middleware)*

| Method | Endpoint | Description | Headers / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/stats` | Retrieve aggregate counts for total, verified, flagged, pending, and unmapped concepts. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/mappings` | List all mappings with status, completeness, and search filters. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/mappings/:system/:id` | Retrieve terminology record, mapping details, completeness, review status, and review history. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `POST` | `/mappings/:system/:id/verify` | Verify a mapping record with optional clinical audit notes. Rejects unmapped records. | `Body: { notes, reviewer }` |
| `POST` | `/mappings/:system/:id/flag` | Flag an incorrect or missing mapping without altering source data. | `Body: { reasonCategory, description, suggestion, reviewer }` |
| `GET` | `/mappings/:system/:id/history` | Retrieve chronological audit history for a record. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/claims-review-requests` | List and inspect pending insurance claims manual medical review requests with stats and filters. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `PATCH` | `/claims-review-requests/:id` | Update claim review status (`pending_review`, `under_review`, `resolved`, `closed`) and append adjudication notes. | `Body: { status, resolutionNotes, adjudicatedBy }` |

#### Admin Authentication
All `/api/admin/*` endpoints require administrative authentication via:
- `Authorization: Bearer <token>` OR `X-Admin-Token: <token>`
- **Development Default Token:** `admin-secret-dev-token-2026`
- **Environment Variable:** `ADMIN_TOKEN` can be defined in your `.env` or system environment.

### FHIR Bundle Endpoints
Base URL: `/api/fhir`

| Method | Endpoint | Description | Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/Bundle` | Ingest a FHIR transaction Bundle. | JSON body containing the FHIR Bundle |
| `GET` | `/CodeSystem` | Retrieve the FHIR CodeSystem for AYUSH systems. | None |
| `GET` | `/ConceptMap` | Retrieve the FHIR ConceptMap linking AYUSH terms to ICD-11. | None |
| `GET` | `/ConceptMap/$translate` | Translate a code to its ICD-11 equivalent. | `code` (required), `system` (required) |

*Note: The Bundle endpoint requires a mock authentication token (configured in `utils/authMiddleware.js`).*

### Researcher Portal & Cohort Discovery Endpoints
Base URL: `/api/research` *(Protected by Researcher Auth Middleware)*

| Method | Endpoint | Description | Query / Headers |
| :--- | :--- | :--- | :--- |
| `GET` | `/records` | Paginated cohort discovery with multi-parameter filtering. Excludes patient & claims data. | `system` (all, Ayurveda, Siddha, Unani), `q`, `tm2Code`, `biomedicalCode`, `mappingStatus`, `verificationStatus`, `page`, `limit` |
| `GET` | `/by-tm2-code` | Cross-tradition exact TM2 code lookup retrieving all linked traditional diagnoses across all 3 traditions simultaneously. Distinctly handles valid-but-unmatched vs invalid codes without substring false-positives. | `code` (required), `system` (optional, default: `all`) |
| `GET` | `/export` | Full dataset export streaming/returning all records matching active filters with proper `Content-Disposition` attachment headers. | `format` (`csv` or `json`), plus all filter parameters |

#### Researcher Authentication
All `/api/research/*` endpoints require authentication via:
- `Authorization: Bearer <token>`
- `X-Researcher-Token: <token>`
- `X-Admin-Token: <token>`
- Query parameter `?token=<token>` (for seamless direct browser file downloads)
- **Development Default Token:** `researcher-secret-dev-token-2026` (or `admin-secret-dev-token-2026`)

#### Research Data Protection & Formula Injection Mitigation
* **Spreadsheet Formula Injection (CWE-1236) Protection**: All CSV cell values beginning with `=`, `+`, `-`, or `@` are automatically sanitized and escaped with an apostrophe prefix (`'`) to neutralize executable formula payloads in Microsoft Excel and Google Sheets.
* **Double-Quote & Delimiter Escaping**: Values containing commas, double quotes, or line breaks are safely quoted and double-quoted.
* **Data Isolation**: Strictly isolates clinical terminology mappings from patient identifiers, ABHA tokens, and claims review notes.

## 🛡️ Architecture & Data Persistence

* **Separate Review Store (`data/mapping-reviews.json`)**: Administrator review metadata, approvals, flags, and audit history are isolated from `data/search-index.json` and `models/mappings.json`. Safe initialization and atomic write operations (`fs.renameSync`) guarantee that data is never lost or overwritten when running `npm run ingest`.
* **Isolated Claims Review Store (`data/claims-review-requests.json`)**: Claims manual medical review requests are stored independently from raw terminology and admin mapping stores. Safe initialization and atomic writes ensure zero regressions to terminology or admin mappings.
* **Unified Research Query Engine (`controllers/researchController.js`)**: Shared filtering logic powers both interactive table pagination and full dataset exports, guaranteeing that UI filters and exported datasets never diverge.
* **Separation of Lifecycles**: Claim review lifecycle states (`pending_review`, `under_review`, `resolved`, `closed`) remain completely independent from clinical mapping verification states (`pending_review`, `verified`, `flagged`). Resolving an insurance claim review does not alter raw source mappings.
* **Duplicate Open Review Prevention**: The claims engine rejects duplicate review requests (HTTP 409 Conflict) for the same claim reference and concept code while an earlier request remains in an active review state.
* **Statutory Compliance & Regulatory Notice**: The Claims Workbench enforces the AYUSH insurance guideline: missing WHO ICD-11 crosswalks do not justify automated claim rejection; processors are guided to route them directly to manual medical review.
* **Stable Composite Keys**: Combines system and ID (e.g. `ayurveda-1`, `siddha-2`, `unani-1`) to prevent collision across traditions where numerical IDs overlap.
* **Deterministic Version Fingerprinting**: Every verified mapping stores a SHA-256 fingerprint hash of its underlying data. If source CSV data or ICD-11 mappings change in a subsequent ingestion, stale verifications are automatically identified and flagged for re-review.

## 📂 Project Structure

```
ayush-terminology-service/
├── controllers/
│   ├── adminController.js         # Healthcare Administrator request handlers
│   ├── bundleController.js        # FHIR Bundle processor & audit logger
│   ├── claimsController.js        # Insurance Claims resolution, search & review requests
│   ├── researchController.js      # Unified query engine, TM2 crosswalk & dataset export
│   └── terminologyController.js   # Terminology search, codeSystem, and ConceptMap
├── data/
│   ├── audit-log.json             # Encounter & bundle audit trails
│   ├── claims-review-requests.json# Persistent insurance claims manual review requests
│   ├── mapping-reviews.json       # Persistent review governance & audit logs
│   └── search-index.json          # Consolidated searchable index (generated)
├── models/
│   ├── claimsStore.js             # Atomic persistence, deduplication & claims lifecycle store
│   ├── mappings.json              # Curated ICD-11 TM2 / Biomedical mappings
│   └── reviewStore.js             # Atomic persistence, fingerprinting & status engine
├── public/
│   ├── admin.html                 # Healthcare Administrator Dashboard UI
│   ├── api-playground.html        # Interactive API tester
│   ├── claims.html                # Insurance Claims Processor Workbench UI
│   ├── index.html                 # Clinician Terminology Search & Problem List UI
│   ├── researcher.html            # Research Data Explorer & Cohort UI
│   ├── css/styles.css             # Unified modern styles & design system
│   └── js/
│       ├── admin.js               # Admin dashboard & claims adjudication client logic
│       ├── api-playground.js      # API playground client logic
│       ├── claims.js              # Claims workbench client logic
│       ├── researcher.js          # Researcher portal & dataset export client logic
│       └── scripts.js             # Clinician UI client logic
├── routes/
│   ├── adminRoutes.js             # /api/admin route definitions
│   ├── bundleRoutes.js            # /api/fhir route definitions
│   ├── claimsRoutes.js            # /api/claims route definitions
│   ├── researchRoutes.js          # /api/research route definitions
│   └── terminologyRoutes.js       # /api/terminology route definitions
├── scratch/
│   ├── test-admin-endpoints.js    # Comprehensive administrator test suite
│   ├── test-claims-endpoints.js   # Comprehensive claims processor test suite
│   └── test-research-endpoints.js # Comprehensive researcher test suite
├── utils/
│   ├── adminAuthMiddleware.js     # Dev-friendly admin auth middleware
│   ├── authMiddleware.js          # Mock ABHA OAuth 2.0 token middleware
│   ├── fhirGenerator.js           # FHIR CodeSystem & ConceptMap generator
│   ├── ingestData.js              # CSV & mapping data ingestion pipeline
│   └── researchAuthMiddleware.js  # Researcher token authentication middleware
├── server.js                      # Application entry point
├── package.json                   # Project metadata and scripts
└── README.md                      # Project documentation
```
