const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsPDF } = require('jspdf');

const root = __dirname;
const sharedPath = path.join(root, 'UI', 'stitch_wit_research_and_analysis', 'shared', 'wit-detect.js');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const pages = [
  { module: 'malaria', directory: 'malaria_detection_wit_research_analysis', classes: ['Parasitized', 'Uninfected'], genderValue: '' },
  { module: 'leukemia', directory: 'leukemia_detection_wit_research_analysis', classes: ['Benign', 'Early', 'Pre', 'Pro'] },
  { module: 'histopathology', directory: 'histopathology_detection_wit_research_analysis', classes: ['Benign', 'Malignant'] }
];

for (const page of pages) {
  const htmlPath = path.join(root, 'UI', 'stitch_wit_research_and_analysis', page.directory, 'code.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const fields = page.genderValue === undefined ? {} : { 'wit-patient-gender': { value: page.genderValue } };
  const document = { getElementById: id => fields[id] || null };
  const window = {
    WIT_CONFIG: { module: page.module, flaggedClasses: [] },
    jspdf: { jsPDF },
    console
  };
  const context = vm.createContext({ window, document, console });
  vm.runInContext(sharedSource, context, { filename: sharedPath });

  const fakeResult = {
    predicted_class: page.classes[0],
    confidence: 0.875,
    class_probabilities: Object.fromEntries(page.classes.map((name, index) => [name, index === 0 ? 0.875 : 0.125 / (page.classes.length - 1)])),
    gradcam_image_base64: pngDataUrl.split(',')[1]
  };
  const outputPath = path.join(root, `${page.module}-page-test-detection-report.pdf`);
  const reportModule = `${page.module}-page-test`;
  const reportPath = path.join(root, `${reportModule}-detection-report.pdf`);
  try {
    window.witGeneratePdfReport(fakeResult, { module: reportModule }, pngDataUrl);
    assert(fs.existsSync(reportPath), 'PDF file was not produced');
    const pdfText = fs.readFileSync(reportPath).toString('latin1');
    assert(!pdfText.includes('Gender: Select'), 'PDF contains bare Gender: Select');
    console.log(`[${page.module}] gender value: ${JSON.stringify(page.genderValue === undefined ? null : page.genderValue)}`);
    console.log(`[${page.module}] contains bare "Gender: Select": false`);
    console.log(`[${page.module}] PDF produced: true | size=${fs.statSync(reportPath).size} bytes`);
  } catch (error) {
    console.log(`[${page.module}] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
