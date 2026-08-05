const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsPDF } = require('jspdf');

const root = __dirname;
const sharedPath = path.join(root, 'UI', 'stitch_wit_research_and_analysis', 'shared', 'wit-detect.js');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const fields = {
  'wit-patient-name': { value: 'Research Subject A' },
  'wit-patient-age': { value: '42' },
  'wit-patient-gender': { value: 'Female' },
  'wit-patient-sample-id': { value: 'SMP-REDESIGN-001' },
  'wit-patient-date': { value: '2026-08-05' }
};
const document = { getElementById: id => fields[id] || null };
const window = {
  WIT_CONFIG: { module: 'histopathology', flaggedClasses: ['Malignant'] },
  jspdf: { jsPDF },
  console
};
const context = vm.createContext({ window, document, console });
vm.runInContext(sharedSource, context, { filename: sharedPath });

const outputPath = path.join(root, 'histopathology-detection-report.pdf');
const result = {
  predicted_class: 'Malignant',
  confidence: 0.9234,
  class_probabilities: { Malignant: 0.9234, Benign: 0.0766 },
  gradcam_image_base64: pngDataUrl.split(',')[1]
};

let threw = false;
try {
  window.witGeneratePdfReport(result, window.WIT_CONFIG, pngDataUrl);
} catch (error) {
  threw = true;
  console.error(error);
}

assert.strictEqual(threw, false, 'redesigned report threw');
assert(fs.existsSync(outputPath), 'redesigned report was not produced');
const pdfBuffer = fs.readFileSync(outputPath);
const pdfText = pdfBuffer.toString('latin1');
const requiredText = [
  'WALCHAND INSTITUTE OF TECHNOLOGY, SOLAPUR',
  'OFFICIAL RESEARCH REPORT',
  'PATIENT & SAMPLE CONTEXT',
  'Research Subject A',
  'SMP-REDESIGN-001',
  'ANALYSIS SUMMARY',
  'CLASS PROBABILITIES',
  'UPLOADED MICROSCOPY IMAGE',
  'GRAD-CAM ACTIVATION OVERLAY',
  'RESEARCH DISCLAIMER',
  'ETHICS & DATA STATEMENT',
  'INSTITUTIONAL STATEMENT',
  'Page 1 of 3',
  'Page 2 of 3',
  'Page 3 of 3'
];

for (const marker of requiredText) {
  assert(pdfText.includes(marker), `missing PDF marker: ${marker}`);
}

console.log(`report threw: ${threw}`);
console.log(`report file exists: ${fs.existsSync(outputPath)}`);
console.log(`report size: ${pdfBuffer.length} bytes`);
console.log(`required markers: ${requiredText.length}/${requiredText.length}`);
console.log('footer pages detected: 3/3');
