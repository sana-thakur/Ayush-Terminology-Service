const codes = require('../models/codes');

// Simple search function
async function searchTerms(query) {
  if (!query) return codes; // return all if query is empty
  const lowerQuery = query.toLowerCase();
  return codes.filter(item => item.namaste.toLowerCase().includes(lowerQuery));
}

module.exports = { searchTerms };
