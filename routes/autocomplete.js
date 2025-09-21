const express = require('express');
const router = express.Router();
const { searchTerms } = require('../controllers/codeController');

router.get('/', async (req, res) => {
  const query = req.query.q || ''; // default to empty string
  try {
    const results = await searchTerms(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
