const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsPDF } = require('jspdf');

const root = __dirname;
const sharedPath = path.join(
  root,
  'UI',
  'stitch_wit_research_and_analysis',
  'shared',
  'wit-detect.js'
);
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const realPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const corruptedPngDataUrl = 'data:image/png;base64,not-a-real-image';
const fallbackNote = '[image could not be embedded]';

const fields = {
  'wit-patient-name': { value: 'Test Patient' },
  'wit-patient-age': { value: '42' },
  'wit-patient-gender': { value: 'Female' },
  'wit-patient-sample-id': { value: 'SMP-TEST-001' },
  'wit-patient-date': { value: '2026-08-04' }
};

const document = {
  getElementById(id) {
    return fields[id] || null;
  }
};

const loggedErrors = [];
const testConsole = {
  error(...args) {
    loggedErrors.push(args.map(value => String(value)).join(' '));
  },
  log(...args) {
    process.stdout.write(args.join(' ') + '\n');
  }
};

const window = {
  WIT_CONFIG: { module: 'malaria', flaggedClasses: [] },
  jspdf: { jsPDF },
  console: testConsole
};

const context = vm.createContext({ window, document, console: testConsole });
vm.runInContext(sharedSource, context, { filename: sharedPath });

const fakeResult = {
  predicted_class: 'Parasitized',
  confidence: 0.9455,
  class_probabilities: {
    Parasitized: 0.9455,
    Uninfected: 0.0545
  },
  gradcam_image_base64: realPngDataUrl.split(',')[1]
};

function runReport(moduleName, imageDataUrl) {
  const outputPath = path.join(root, `${moduleName}-detection-report.pdf`);
  try {
    window.witGeneratePdfReport(fakeResult, { module: moduleName }, imageDataUrl);
    return { threw: false, outputPath };
  } catch (error) {
    return { threw: true, outputPath, error: String(error) };
  }
}

const valid = runReport('malaria-valid', realPngDataUrl);
const corrupted = runReport('malaria-corrupted', corruptedPngDataUrl);

const validSize = fs.statSync(valid.outputPath).size;
const corruptedSize = fs.statSync(corrupted.outputPath).size;
const corruptedPdfText = fs.readFileSync(corrupted.outputPath).toString('latin1');

console.log(`valid PNG report threw: ${valid.threw}`);
console.log(`corrupted PNG report threw: ${corrupted.threw}`);
console.log(`valid PDF size: ${validSize} bytes`);
console.log(`corrupted PDF size: ${corruptedSize} bytes`);
console.log(`corrupted PDF contains fallback note: ${corruptedPdfText.includes(fallbackNote)}`);
console.log(`logged image errors: ${loggedErrors.length}`);
for (const error of loggedErrors) console.log(`logged error: ${error}`);
