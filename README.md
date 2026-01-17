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
| `GET` | `/search` | Search for terms. | `q` (search query), `system` (optional filter: Ayurveda, Siddha, Unani) |
| `GET` | `/CodeSystem` | Retrieve the FHIR CodeSystem for a specific system. | `system` (required: e.g., Ayurveda) |
| `GET` | `/ConceptMap` | Retrieve the FHIR ConceptMap linking AYUSH terms to ICD-11. | `system` (required) |
| `GET` | `/ConceptMap/$translate` | Translate a code to its ICD-11 equivalent. | `code` (required), `system` (required) |

### FHIR Bundle Endpoints
Base URL: `/api/fhir`

| Method | Endpoint | Description | Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/Bundle` | Ingest a FHIR Bundle resource. | JSON body containing the FHIR Bundle |

*Note: The Bundle endpoint requires a mock authentication token (configured in `utils/authMiddleware.js`).*

## 📂 Project Structure

```
ayush-terminology-service/
├── controllers/        # Request handlers (logic)
├── data/               # Generated data files (search-index.json)
├── models/             # Data models and static mappings
├── public/             # Static frontend files
├── routes/             # API route definitions
├── utils/              # Helper scripts (ingestion, auth)
├── server.js           # Application entry point
├── package.json        # Project metadata and scripts
└── README.md           # Project documentation
```
