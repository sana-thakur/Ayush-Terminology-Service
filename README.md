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

### Healthcare Administrator Endpoints
Base URL: `/api/admin` *(Protected by Admin Auth Middleware)*

| Method | Endpoint | Description | Headers / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/stats` | Retrieve aggregate counts for total, verified, flagged, pending, and unmapped concepts. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `GET` | `/mappings/:system/:id` | Retrieve terminology record, mapping details, completeness, review status, and review history. | `Authorization: Bearer <ADMIN_TOKEN>` |
| `POST` | `/mappings/:system/:id/verify` | Verify a mapping record with optional clinical audit notes. Rejects unmapped records. | `Body: { notes, reviewer }` |
| `POST` | `/mappings/:system/:id/flag` | Flag an incorrect or missing mapping without altering source data. | `Body: { reasonCategory, description, suggestion, reviewer }` |
| `GET` | `/mappings/:system/:id/history` | Retrieve chronological audit history for a record. | `Authorization: Bearer <ADMIN_TOKEN>` |

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

*Note: The Bundle endpoint requires a mock authentication token (configured in `utils/authMiddleware.js`).*

## 🛡️ Architecture & Data Persistence

* **Separate Review Store (`data/mapping-reviews.json`)**: Administrator review metadata, approvals, flags, and audit history are isolated from `data/search-index.json` and `models/mappings.json`. Safe initialization and atomic write operations (`fs.renameSync`) guarantee that data is never lost or overwritten when running `npm run ingest`.
* **Stable Composite Keys**: Combines system and ID (e.g. `ayurveda-1`, `siddha-2`, `unani-1`) to prevent collision across traditions where numerical IDs overlap.
* **Deterministic Version Fingerprinting**: Every verified mapping stores a SHA-256 fingerprint hash of its underlying data. If source CSV data or ICD-11 mappings change in a subsequent ingestion, stale verifications are automatically identified and flagged for re-review.

## 📂 Project Structure

```
ayush-terminology-service/
├── controllers/
│   ├── adminController.js         # Healthcare Administrator request handlers
│   ├── bundleController.js        # FHIR Bundle processor & audit logger
│   └── terminologyController.js   # Terminology search, codeSystem, and ConceptMap
├── data/
│   ├── audit-log.json             # Encounter & bundle audit trails
│   ├── mapping-reviews.json       # Persistent review governance & audit logs
│   └── search-index.json          # Consolidated searchable index (generated)
├── models/
│   ├── mappings.json              # Curated ICD-11 TM2 / Biomedical mappings
│   └── reviewStore.js             # Atomic persistence, fingerprinting & status engine
├── public/
│   ├── admin.html                 # Healthcare Administrator Dashboard UI
│   ├── api-playground.html        # Interactive API tester
│   ├── index.html                 # Clinician Terminology Search & Problem List UI
│   ├── css/styles.css             # Unified modern styles & design system
│   └── js/
│       ├── admin.js               # Admin dashboard client logic
│       ├── api-playground.js      # API playground client logic
│       └── scripts.js             # Clinician UI client logic
├── routes/
│   ├── adminRoutes.js             # /api/admin route definitions
│   ├── bundleRoutes.js            # /api/fhir route definitions
│   └── terminologyRoutes.js       # /api/terminology route definitions
├── utils/
│   ├── adminAuthMiddleware.js     # Dev-friendly admin auth middleware
│   ├── authMiddleware.js          # Mock ABHA OAuth 2.0 token middleware
│   ├── fhirGenerator.js           # FHIR CodeSystem & ConceptMap generator
│   └── ingestData.js              # CSV & mapping data ingestion pipeline
├── server.js                      # Application entry point
├── package.json                   # Project metadata and scripts
└── README.md                      # Project documentation
```
