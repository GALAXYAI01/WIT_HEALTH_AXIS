const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = __dirname;
const sharedScript = fs.readFileSync(
  path.join(root, 'UI', 'stitch_wit_research_and_analysis', 'shared', 'wit-detect.js'),
  'utf8'
);

const pages = [
  {
    module: 'malaria',
    directory: 'malaria_detection_wit_research_analysis',
    classes: ['Parasitized', 'Uninfected']
  },
  {
    module: 'leukemia',
    directory: 'leukemia_detection_wit_research_analysis',
    classes: ['Benign', 'Early', 'Pre', 'Pro']
  },
  {
    module: 'histopathology',
    directory: 'histopathology_detection_wit_research_analysis',
    classes: ['Benign', 'Malignant']
  }
];

const tabIds = ['summary', 'probs', 'gradcam'];
let failures = 0;

for (const page of pages) {
  const htmlPath = path.join(
    root,
    'UI',
    'stitch_wit_research_and_analysis',
    page.directory,
    'code.html'
  );
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    url: `http://127.0.0.1/${page.directory}/code.html`,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.tailwind = {};
    }
  });
  const { window } = dom;

  window.WIT_CONFIG = {
    module: page.module,
    classes: page.classes,
    flaggedClasses: []
  };
  window.eval(sharedScript);

  const fakeResponse = {
    module: page.module,
    predicted_class: page.classes[0],
    confidence: 0.875,
    class_probabilities: Object.fromEntries(
      page.classes.map((className, index) => [className, index === 0 ? 0.875 : 0.125 / (page.classes.length - 1)])
    ),
    gradcam_image_base64: 'ZmFrZQ=='
  };
  window.witRenderResults(fakeResponse);

  console.log(`=== ${page.module} ===`);
  for (const tabId of tabIds) {
    const button = window.document.getElementById(`tab-btn-${tabId}`);
    assert(button, `missing tab button tab-btn-${tabId}`);
    button.click();

    const panes = tabIds.map(id => window.document.getElementById(`tab-${id}`));
    const visiblePanes = panes.filter(pane => pane.style.display !== 'none' && !pane.classList.contains('hidden'));
    const hiddenPanes = panes.filter(pane => pane.style.display === 'none' && pane.classList.contains('hidden'));
    const selectedButtons = tabIds
      .map(id => window.document.getElementById(`tab-btn-${id}`))
      .filter(btn => btn.classList.contains('border-b-2') && btn.classList.contains('border-primary') && btn.classList.contains('text-primary'));

    try {
      assert.strictEqual(visiblePanes.length, 1, 'expected exactly one visible pane');
      assert.strictEqual(hiddenPanes.length, 2, 'expected exactly two hidden panes');
      assert.strictEqual(visiblePanes[0].id, `tab-${tabId}`, 'wrong visible pane');
      assert.strictEqual(selectedButtons.length, 1, 'expected exactly one selected button');
      assert.strictEqual(selectedButtons[0].id, `tab-btn-${tabId}`, 'wrong selected button');
      assert.strictEqual(button.getAttribute('aria-selected'), 'true', 'clicked button is not aria-selected');
      console.log(`[${page.module}] click ${tabId}: PASS | visible=${visiblePanes[0].id} | hidden=${hiddenPanes.map(pane => pane.id).join(',')} | selected=${selectedButtons[0].id}`);
    } catch (error) {
      failures += 1;
      console.log(`[${page.module}] click ${tabId}: FAIL | ${error.message}`);
    }
  }

  window.close();
}

console.log(`TOTAL: ${failures === 0 ? 'PASS' : 'FAIL'} | failures=${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
