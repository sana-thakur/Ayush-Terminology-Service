const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const terminologyService = require('./controllers/terminologyController');

// Routes
const terminologyRoutes = require('./routes/terminologyRoutes');
const bundleRoutes = require('./routes/bundleRoutes');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' })); // Increase limit for FHIR Bundles

// --- Initialize Terminology Service ---
// Load all data into memory on startup
try {
  terminologyService.loadData();
  console.log('NAMASTE terminology data loaded successfully.');
} catch (error) {
  console.error('Failed to load terminology data. Exiting.', error);
  process.exit(1);
}

// Serve static frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/terminology', terminologyRoutes);
app.use('/api/fhir', bundleRoutes); // FHIR-specific endpoints

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
