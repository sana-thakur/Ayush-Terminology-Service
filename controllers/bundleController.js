const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // We need to install this dependency

// Run: npm install uuid

// Simple audit log (in a real system, this would be a database)
const auditLogPath = path.join(__dirname, '..', 'data', 'audit-log.json');

function audit(entry) {
  let log = [];
  if (fs.existsSync(auditLogPath)) {
    log = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
  }
  log.push(entry);
  fs.writeFileSync(auditLogPath, JSON.stringify(log, null, 2));
}

async function ingestBundle(req, res) {
  const bundle = req.body;
  const abhaToken = req.headers.authorization; // From authMiddleware

  // --- Basic Validation ---
  if (!bundle || bundle.resourceType !== 'Bundle') {
    return res.status(400).json({ error: 'Invalid FHIR Bundle provided.' });
  }

  // --- Auditing (as per EHR Standards) ---
  const auditEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    event: 'FHIR_BUNDLE_INGEST',
    outcome: 'Success',
    source: 'EMR-Client',
    user: {
      abhaId: abhaToken ? abhaToken.split(' ')[1] : 'Unknown', // Extract token
    },
    bundleId: bundle.id || 'N/A',
    entryCount: bundle.entry ? bundle.entry.length : 0
  };

  audit(auditEntry);
  console.log('Audit log entry created:', auditEntry);

  // In a real system, you would now process each entry in the bundle:
  // 1. Validate each resource against FHIR profiles.
  // 2. Check for consent via a Consent Manager service.
  // 3. Persist the resources to a FHIR database (e.g., HAPI FHIR, Azure FHIR).
  // 4. Implement version tracking for each resource.

  res.status(200).json({
    status: 'success',
    message: `Bundle with ID ${bundle.id || 'N/A'} received and audited.`,
    auditId: auditEntry.id
  });
}

module.exports = { ingestBundle };
