
const express = require('express');
const router = express.Router();
const { ingestBundle } = require('../controllers/bundleController');

router.post('/', async (req, res) => {
  const bundle = req.body;
  try {
    await ingestBundle(bundle); // store in DB + audit
    res.json({ status: 'success' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
