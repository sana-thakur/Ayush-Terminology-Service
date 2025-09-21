const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

console.log('--- Starting NAMASTE Data Ingestion Script ---');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log('Created data directory.');
}

const sources = [
  { file: path.join(__dirname, '..', 'Ayurveda.csv'), system: 'Ayurveda', idCol: 'NAMC_ID', termCol: 'NAMC_term', codeCol: 'NAMC_CODE', defCol: 'Short_definition' },
  { file: path.join(__dirname, '..', 'Siddha.csv'), system: 'Siddha', idCol: 'NAMC_ID', termCol: 'NAMC_TERM', codeCol: 'NAMC_CODE', defCol: 'Short_definition' },
  { file: path.join(__dirname, '..', 'Unani.csv'), system: 'Unani', idCol: 'NUMC_ID', termCol: 'NUMC_TERM', codeCol: 'NUMC_CODE', defCol: 'Short_definition' }
];

const mappingsPath = path.join(__dirname, '..', 'models', 'mappings.json');
let mappingMap = new Map();
let allTerms = [];

// --- Step 1: Load Mappings First ---
try {
  const mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
  mappings.forEach(m => {
    const key = `${m.system.toLowerCase()}-${m.id}`;
    mappingMap.set(key, m);
  });
  console.log(`Successfully loaded and indexed ${mappingMap.size} mappings from mappings.json.`);
} catch (error) {
  console.error(`Error reading mappings.json: ${error.message}. Continuing without mappings.`);
}


// --- Step 2: Process Each CSV File ---
async function processFile(source) {
  return new Promise((resolve, reject) => {
    const terms = [];
    console.log(`\nProcessing file: ${source.file}`);
    fs.createReadStream(source.file)
      .pipe(csv())
      .on('data', (row) => {
        // Trim keys to handle potential whitespace issues from CSV export
        const sanitizedRow = Object.keys(row).reduce((acc, key) => {
          acc[key.trim()] = row[key];
          return acc;
        }, {});

        const id = sanitizedRow[source.idCol];
        const term = sanitizedRow[source.termCol];
        const code = sanitizedRow[source.codeCol];

        if (id && term && term.trim() !== '') {
          // --- The Key Logic: Merging the data ---
          const mappingKey = `${source.system.toLowerCase()}-${id}`;
          const mapping = mappingMap.get(mappingKey) || {}; // Get the mapping if it exists

          terms.push({
            system: source.system,
            id: id,
            code: code,
            term: term,
            definition: sanitizedRow[source.defCol] || sanitizedRow['Long_definition'] || '',
            // Use mapped data if available, otherwise use defaults
            icd11_tm2_code: mapping.icd11_tm2_code || 'N/A',
            icd11_tm2_display: mapping.icd11_tm2_display || 'Not Mapped',
            icd11_biomed_code: mapping.icd11_biomed_code || 'N/A',
            icd11_biomed_display: mapping.icd11_biomed_display || 'Not Mapped',
          });
        }
      })
      .on('end', () => {
        console.log(`-> Finished processing ${terms.length} terms from ${source.file}.`);
        resolve(terms);
      })
      .on('error', reject);
  });
}

// --- Step 3: Run the Ingestion and Save ---
async function ingestAll() {
  try {
    for (const source of sources) {
      const terms = await processFile(source);
      allTerms = allTerms.concat(terms);
    }

    const outputPath = path.join(dataDir, 'search-index.json');
    fs.writeFileSync(outputPath, JSON.stringify(allTerms, null, 2));
    console.log(`\n[SUCCESS] Created combined search index at ${outputPath}`);
    console.log(`Total terms processed and written: ${allTerms.length}`);

  } catch (error) {
    console.error('[FATAL ERROR] Error during data ingestion:', error);
  }
}

// Run the main function
ingestAll();
