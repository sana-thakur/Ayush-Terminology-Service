// --- FHIR CodeSystem Generator ---
function generateCodeSystem(terms) {
  const codeSystem = {
    resourceType: 'CodeSystem',
    id: 'namaste-terms',
    url: 'http://namaste.gov.in/CodeSystem/namaste-terms',
    version: '1.0.0',
    name: 'NAMASTETerminology',
    title: 'National AYUSH Morbidity & Standardized Terminologies',
    status: 'active',
    date: new Date().toISOString(),
    publisher: 'Ministry of Ayush, Government of India',
    description: 'A unified CodeSystem for Ayurveda, Siddha, and Unani terms from NAMASTE.',
    caseSensitive: false,
    content: 'complete',
    concept: terms.map(term => ({
      code: term.code,
      display: term.term,
      definition: term.definition,
      designation: [{
        use: {
          system: 'http://namaste.gov.in/CodeSystem/tradition',
          code: term.system.toLowerCase()
        },
        value: term.system
      }]
    }))
  };
  return codeSystem;
}

// --- FHIR ConceptMap Generator ---
function generateConceptMap(terms) {
  const mappedTerms = terms.filter(t => t.icd11_tm2_code !== 'N/A');

  const conceptMap = {
    resourceType: 'ConceptMap',
    id: 'namaste-to-icd11',
    url: 'http://namaste.gov.in/ConceptMap/namaste-to-icd11',
    name: 'NAMASTEToICD11Mapping',
    title: 'Mapping from NAMASTE to ICD-11 TM2 and Biomedicine',
    status: 'active',
    sourceUri: 'http://namaste.gov.in/CodeSystem/namaste-terms',
    targetUri: 'http://id.who.int/icd/entity',
    group: []
  };

  const systems = ['Ayurveda', 'Siddha', 'Unani'];
  systems.forEach(system => {
    const group = {
      source: `http://namaste.gov.in/CodeSystem/namaste-terms`,
      target: 'http://id.who.int/icd/entity',
      element: mappedTerms
        .filter(term => term.system === system)
        .map(term => ({
          code: term.code,
          display: term.term,
          target: [
            {
              code: term.icd11_tm2_code,
              display: term.icd11_tm2_display,
              equivalence: 'equivalent'
            },
            {
              code: term.icd11_biomed_code,
              display: term.icd11_biomed_display,
              equivalence: 'relatedto' // Indicates a related biomedical concept
            }
          ]
        }))
    };
    if (group.element.length > 0) {
      conceptMap.group.push(group);
    }
  });

  return conceptMap;
}

module.exports = { generateCodeSystem, generateConceptMap };
