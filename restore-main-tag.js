// restore-main-tag.js
// Undoes update-script-tags.js: replaces the 19 <script src="js/core|modules/...js"> tags in every .html file
// with ONE <script src="main.js"></script> tag.
//
//   node restore-main-tag.js --dry     preview (nothing is written)
//   node restore-main-tag.js           apply
//
// Run it in the folder that has your .html pages. Safe to run twice. Line endings are kept.
const fs = require('fs');
const path = require('path');
const dry = process.argv.includes('--dry');
const BLOCK = /(?:[ \t]*<script\s+src="js\/(?:core|modules)\/[^"]+"><\/script>[ \t]*(?:\r?\n)?)+/g;

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules' || e.name === '.git') return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.toLowerCase().endsWith('.html') ? [full] : [];
  });
}

let changed = 0;
for (const file of htmlFiles(process.cwd())) {
  const text = fs.readFileSync(file, 'utf8');
  BLOCK.lastIndex = 0;
  if (!BLOCK.test(text)) continue;
  BLOCK.lastIndex = 0;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const updated = text.replace(BLOCK, block => {
    const indent = block.match(/^[ \t]*/)[0];
    const endsWithNewline = /\n$/.test(block);
    return indent + '<script src="main.js"></script>' + (endsWithNewline ? eol : '');
  });
  if (!dry) fs.writeFileSync(file, updated);
  changed++;
  console.log((dry ? 'would restore : ' : 'restored      : ') + file);
}
console.log('\n' + changed + ' file(s) ' + (dry ? 'would be ' : '') + 'changed.');