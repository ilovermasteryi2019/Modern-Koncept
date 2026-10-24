// =============================================================================
// K-DESK · dimensions.js
// dimensions
// Cut from the original main.js (lines 19-5414 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { escapeHtmlText } from './core.js';

/* =============================================================================
   K-Desk: shared furniture dimension utility (browser + Node)

   SINGLE source of truth for reading, converting, validating and formatting furniture dimensions.
   Used by: furniture-detail.html (text, rulers, diagram), ai-visualization.html (size label) and
   server.js (the size sent to the AI room visualizer). Nothing else should parse or convert dimensions.

   Verified storage (from main.js, admin furniture form, and server.js):
     furniture.dimensions is ONE free-text string, written by the admin form as
         "<Length>cm x <Width>cm x <Height>cm"          e.g. "81.3cm x 86.4cm x 91.4cm"
     The server saves any string up to 100 characters with no format check, so a record may also hold
     other units or formats. This module therefore reads the unit written on every value and NEVER guesses one.

   Axis mapping (admin form order -> customer meaning), the only place it lives:
     1st value (Length) -> Width   (left to right across the front)
     2nd value (Width)  -> Depth   (front to back)
     3rd value (Height) -> Height  (floor to top)
   ========================================================================== */
export const KDeskDimensions = (function () {
  'use strict';

  const AXES = ['width', 'depth', 'height'];
  const STORED_ORDER = ['width', 'depth', 'height'];            // Length x Width x Height as saved by the admin form
  const AXIS_LABEL = { width: 'Width', depth: 'Depth', height: 'Height' };
  const UNAVAILABLE_TEXT = 'Dimensions unavailable';
  const INCHES_PER = { mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54, in: 1, ft: 12 };   // 1 in = 2.54 cm, 1 ft = 12 in

  // ---------------------------------------------------------------------------
  // Validation rules per furniture type (inches). Configurable: edit here or call registerType().
  // These are sanity checks, not manufacturer data. A value outside a range puts the record in
  // the "review" state (never clamped or changed). Categories with no rule only get the basic checks.
  // ---------------------------------------------------------------------------
  const TYPE_RULES = {
    armchair:      { label: 'Armchair',      aliases: ['armchair', 'arm chair'],           ranges: { width: [28, 40], depth: [30, 40], height: [30, 40] } },
    sofa:          { label: 'Sofa',          aliases: ['sofa'],                            ranges: { width: [60, 96], depth: [30, 40], height: [28, 40] } },
    'dining-chair': { label: 'Dining Chair', aliases: ['dining chair'],                    ranges: { width: [16, 24], depth: [18, 24], height: [30, 40] } }
  };

  function registerType(key, def) { TYPE_RULES[key] = def; }

  // "Armchairs", "ARM-CHAIR", " Dining  Chair " -> comparable lowercase words, singular.
  function normaliseText(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z]+/g, ' ').trim().replace(/s$/, '');
  }

  // Picks the rule from the category. Only when the category matches nothing, the product NAME is checked,
  // and only if it ENDS with a type phrase ("Oslo Armchair"), so "Sofa Table" is not treated as a sofa.
  function detectType(product) {
    const match = text => Object.keys(TYPE_RULES).find(k => TYPE_RULES[k].aliases.some(a => text === normaliseText(a)));
    const byCategory = match(normaliseText(product && product.category));
    if (byCategory) return byCategory;
    const name = normaliseText(product && product.name);
    return Object.keys(TYPE_RULES).find(k => TYPE_RULES[k].aliases.some(a => name === a || name.endsWith(' ' + a))) || null;
  }

  // ---------------------------------------------------------------------------
  // Parsing: stored text -> inches per axis. Every unit is explicit or the record is rejected.
  // ---------------------------------------------------------------------------
  const UNIT_WORDS = 'mm|cm|m|ft|feet|foot|inches|inch|in|\'|′|"|″|”';
  const PART_RE = new RegExp(
    '^(?:(width|depth|height|length|w|d|h|l)\\s*[:=]?\\s*)?' +          // optional axis label
    '(-?\\d+(?:\\.\\d+)?)\\s*' +                                        // number (decimals stay decimals)
    '(?:(' + UNIT_WORDS + ')(?![a-z]))?' +                              // optional unit
    '(?:\\s*(\\d+(?:\\.\\d+)?)\\s*(inches|inch|in|"|″|”)(?![a-z]))?$', // optional "+ 6 in" after feet
    'i'
  );

  function unitKey(u) {
    if (!u) return null;
    u = u.toLowerCase();
    if (u === 'feet' || u === 'foot' || u === "'" || u === '′') return 'ft';
    if (u === 'inch' || u === 'inches' || u === '"' || u === '″' || u === '”') return 'in';
    return u;
  }
  function labelKey(l) {
    if (!l) return null;
    l = l.toLowerCase();
    return l[0] === 'w' ? 'width' : l[0] === 'd' ? 'depth' : l[0] === 'h' ? 'height' : 'length';
  }

  // Returns { exact: {width, depth, height} (unrounded inches), problem: null | code }
  function parseStored(raw) {
    const fail = problem => ({ exact: null, problem });
    if (raw == null || typeof raw !== 'string' || !raw.trim()) return fail('missing');
    const parts = raw.trim().split(/\s*(?:[x×*]|\bby\b)\s*/i);
    if (parts.length !== 3) return fail('incomplete');   // 1, 2 or 4+ values: cannot tell which side is which

    const tokens = [];
    for (const p of parts) {
      const m = PART_RE.exec(p.trim());
      if (!m) return fail('unreadable');
      const num = parseFloat(m[2]);
      if (!Number.isFinite(num)) return fail('unreadable');
      tokens.push({ label: labelKey(m[1]), num, unit: unitKey(m[3]), extraIn: m[4] ? parseFloat(m[4]) : null });
    }

    // A unit written once at the end ("32 x 34 x 36 in") applies to the values before it.
    const last = tokens[2];
    if (last.unit && tokens[0].unit === null && tokens[1].unit === null) { tokens[0].unit = last.unit; tokens[1].unit = last.unit; }
    if (tokens.some(t => t.unit === null)) return fail('unit_unverified');
    if (tokens.some(t => t.extraIn !== null && t.unit !== 'ft')) return fail('unreadable');

    const inches = tokens.map(t => t.num * INCHES_PER[t.unit] + (t.extraIn || 0));

    // Order: explicit labels win, otherwise the stored Length x Width x Height order.
    const exact = { width: null, depth: null, height: null };
    const labelled = tokens.filter(t => t.label).length;
    if (labelled && labelled !== 3) return fail('unreadable');
    if (labelled) {
      const hasWidth = tokens.some(t => t.label === 'width');
      for (let i = 0; i < 3; i++) {
        let axis = tokens[i].label;
        if (axis === 'length') axis = hasWidth ? 'depth' : 'width';
        if (exact[axis] !== null) return fail('unreadable');   // same axis twice
        exact[axis] = inches[i];
      }
    } else {
      STORED_ORDER.forEach((axis, i) => { exact[axis] = inches[i]; });
    }
    return { exact, problem: null };
  }

  // ---------------------------------------------------------------------------
  // Formatting: decimal inches stay decimal inches. 29.5 -> "29.5 in", 32 -> "32 in". Never feet.
  // ---------------------------------------------------------------------------
  function roundInches(n) { return Math.round(n * 10) / 10; }          // one decimal place
  function formatInches(n) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
    return String(roundInches(n)) + ' in';
  }

  const MESSAGES = {
    missing: 'No dimensions are saved for this product.',
    incomplete: 'Dimensions must contain exactly three values (width, depth, height).',
    unreadable: 'The saved dimensions could not be read.',
    unit_unverified: 'A saved dimension has no unit, so it cannot be converted safely.',
    non_positive: 'A saved dimension is zero or negative.',
    out_of_range: 'A saved dimension is outside the expected range for this furniture type.'
  };

  // ---------------------------------------------------------------------------
  // resolve(): the one function every page calls.
  //   status 'valid'       -> inches / formatted / text are safe to show and to send to the visualizer
  //   status 'review'      -> all values readable but outside the type's range: customers see "Dimensions unavailable"
  //   status 'unavailable' -> missing / unreadable / unit unknown / zero / negative
  // ---------------------------------------------------------------------------
  function resolve(product) {
    const type = detectType(product || {});
    const result = {
      status: 'unavailable', reason: null, message: '', type, typeLabel: type ? TYPE_RULES[type].label : null,
      inches: null, formatted: null, text: UNAVAILABLE_TEXT, issues: [], exactInches: null
    };
    const parsed = parseStored(product ? product.dimensions : null);
    if (parsed.problem) { result.reason = parsed.problem; result.message = MESSAGES[parsed.problem]; return result; }

    const bad = AXES.filter(a => !Number.isFinite(parsed.exact[a]) || roundInches(parsed.exact[a]) <= 0);
    if (bad.length) {
      result.reason = 'non_positive'; result.message = MESSAGES.non_positive;
      result.issues = bad.map(a => ({ axis: a, problem: 'non_positive' }));
      return result;
    }

    const inches = {};
    AXES.forEach(a => { inches[a] = roundInches(parsed.exact[a]); });

    if (type) {
      const ranges = TYPE_RULES[type].ranges;
      const outside = AXES.filter(a => ranges[a] && (inches[a] < ranges[a][0] || inches[a] > ranges[a][1]));
      if (outside.length) {
        result.status = 'review'; result.reason = 'out_of_range'; result.inches = inches;
        result.issues = outside.map(a => ({ axis: a, problem: 'out_of_range', value: inches[a], min: ranges[a][0], max: ranges[a][1] }));
        result.message = TYPE_RULES[type].label + ': ' + result.issues.map(i =>
          AXIS_LABEL[i.axis] + ' ' + formatInches(i.value) + ' is outside ' + i.min + '-' + i.max + ' in').join('; ') + '.';
        return result;                                         // reported, never clamped
      }
    }

    const formatted = {};
    AXES.forEach(a => { formatted[a] = formatInches(inches[a]); });
    result.status = 'valid';
    result.inches = inches;
    result.exactInches = parsed.exact;
    result.formatted = formatted;
    result.text = AXES.map(a => AXIS_LABEL[a] + ': ' + formatted[a]).join(' × ');
    return result;
  }

  // Admin edit form (still in centimetres): returns the saved values as cm for the three inputs, or null
  // when the record cannot be read. Prevents "32in x 34in x 36in" being loaded as 32 / 34 / 36 cm.
  function toFormCentimeters(raw) {
    const p = parseStored(raw);
    if (p.problem) return null;
    const cm = a => Math.round(p.exact[a] * 2.54 * 100) / 100;
    return { length: cm('width'), width: cm('depth'), height: cm('height') };
  }

  return { resolve, parseStored, formatInches, toFormCentimeters, registerType, detectType, TYPE_RULES, AXES, AXIS_LABEL, UNAVAILABLE_TEXT };
})();

// Run in the browser console on any page:  kdeskDimensionSelfTest()   (prints a pass/fail line per test)
function kdeskDimensionSelfTest() {
  const assert = {
    strictEqual: (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); },
    notStrictEqual: (a, b, m) => { if (a === b) throw new Error((m || '') + ' unexpected ' + JSON.stringify(a)); },
    deepStrictEqual: (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); },
    ok: (v, m) => { if (!v) throw new Error(m || 'not ok'); }
  };
  let passed = 0, failed = 0;
  const t = (name, fn) => {
    try { fn(); passed++; console.log('%cPASS%c ' + name, 'color:green', ''); }
    catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
  };
const arm = d => KDeskDimensions.resolve({ category: 'Armchair', name: 'Test', dimensions: d });
  
  t('armchair 32x34x36 in is valid and formatted', () => {
    const r = arm('32in x 34in x 36in');
    assert.strictEqual(r.status, 'valid');
    assert.strictEqual(r.text, 'Width: 32 in × Depth: 34 in × Height: 36 in');
  });
  t('same armchair stored as cm (81.28/86.36/91.44) converts to 32/34/36 in', () => {
    assert.strictEqual(arm('81.28cm x 86.36cm x 91.44cm').text, 'Width: 32 in × Depth: 34 in × Height: 36 in');
    assert.strictEqual(arm('81.3cm x 86.4cm x 91.4cm').text, 'Width: 32 in × Depth: 34 in × Height: 36 in'); // admin-form rounding
  });
  t('decimal inches stay decimal inches (never feet)', () => {
    const r = arm('29.5in x 34in x 36in');
    assert.strictEqual(r.formatted.width, '29.5 in');
    assert.ok(!/ft/.test(r.text));
    assert.strictEqual(KDeskDimensions.formatInches(29.5), '29.5 in');
    assert.strictEqual(KDeskDimensions.formatInches(32), '32 in');
    assert.strictEqual(KDeskDimensions.formatInches(34), '34 in');
    assert.strictEqual(KDeskDimensions.formatInches(36), '36 in');
  });
  t('bare "29.5" is never read as 29 ft 6 in', () => {
    const r = arm('29.5 x 34 x 36');
    assert.strictEqual(r.status, 'unavailable'); assert.strictEqual(r.reason, 'unit_unverified');
  });
  t('one trailing unit applies to all values', () => assert.strictEqual(arm('32 x 34 x 36 in').status, 'valid'));
  t('feet notation converts correctly', () => assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofa', dimensions: "6ft x 3ft x 3ft" }).text, 'Width: 72 in × Depth: 36 in × Height: 36 in'));
  t('missing width/depth/height -> unavailable', () => {
    ['', null, undefined, 'x 34in x 36in', '32in x 34in', '32in x  x 36in', '32in x 34in x'].forEach(v => {
      const r = arm(v); assert.strictEqual(r.status, 'unavailable', String(v)); assert.strictEqual(r.text, 'Dimensions unavailable');
    });
  });
  t('zero, negative, non-numeric, non-finite rejected', () => {
    ['0in x 34in x 36in', '-32in x 34in x 36in', '32in x 0in x 36in', 'abc x 34in x 36in', 'Infinity x NaN x 36in', '32in x 34in x 36in x 9in'].forEach(v => {
      assert.notStrictEqual(arm(v).status, 'valid', v);
    });
    assert.strictEqual(arm('0in x 34in x 36in').reason, 'non_positive');
  });
  t('armchair outside range -> review, shown as unavailable, never clamped', () => {
    const r = arm('20in x 34in x 36in');
    assert.strictEqual(r.status, 'review'); assert.strictEqual(r.text, 'Dimensions unavailable');
    assert.strictEqual(r.issues[0].axis, 'width'); assert.strictEqual(r.inches.width, 20);
    assert.strictEqual(arm('41in x 34in x 36in').status, 'review');
    assert.strictEqual(arm('28in x 30in x 30in').status, 'valid');       // boundaries inclusive
    assert.strictEqual(arm('40in x 40in x 40in').status, 'valid');
  });
  t('a centimetre record that was typed as inches is caught (13 in armchair)', () => assert.strictEqual(arm('32cm x 34cm x 36cm').status, 'review'));
  t('sofa and dining chair use their own ranges', () => {
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofa', dimensions: '84in x 36in x 34in' }).status, 'valid');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofas', dimensions: '50in x 36in x 34in' }).status, 'review');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Dining Chair', dimensions: '18in x 20in x 36in' }).status, 'valid');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Dining Chairs', dimensions: '30in x 20in x 36in' }).status, 'review');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Armchair', dimensions: '18in x 20in x 36in' }).status, 'review'); // not the dining-chair range
  });
  t('unrelated categories only get the basic checks', () => {
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Cabinet', dimensions: '48in x 18in x 72in' }).status, 'valid');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofa Table', name: 'Sofa Table', dimensions: '48in x 16in x 28in' }).status, 'valid');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Cabinet', dimensions: '0in x 18in x 72in' }).status, 'unavailable');
  });
  t('type from product name only when it ENDS with a type', () => {
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Chairs', name: 'Oslo Armchair', dimensions: '20in x 34in x 36in' }).status, 'review');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Chairs', name: 'Armchair Cushion', dimensions: '20in x 34in x 36in' }).status, 'valid');
  });
  t('record in centimetres converts only with a verified unit', () => {
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofa', dimensions: '200cm x 90cm x 85cm' }).text, 'Width: 78.7 in × Depth: 35.4 in × Height: 33.5 in');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Sofa', dimensions: '200 x 90 x 85' }).status, 'unavailable');
  });
  t('labelled and mixed-unit strings', () => {
    assert.strictEqual(arm('W 32in x D 34in x H 36in').text, 'Width: 32 in × Depth: 34 in × Height: 36 in');
    assert.strictEqual(arm('H 36in x W 32in x D 34in').text, 'Width: 32 in × Depth: 34 in × Height: 36 in');
    assert.strictEqual(KDeskDimensions.resolve({ category: 'Cabinet', dimensions: "4ft x 18in x 6ft" }).text, 'Width: 48 in × Depth: 18 in × Height: 72 in');
  });
  t('valid DB record is never overridden by anything else (pure function of the record)', () => {
    const rec = { category: 'Armchair', dimensions: '32in x 34in x 36in', imageWidth: 10, height: 999, containerHeight: 500 };
    assert.deepStrictEqual(KDeskDimensions.resolve(rec).inches, { width: 32, depth: 34, height: 36 });
  });
  t('admin edit form gets centimetres back', () => {
    assert.deepStrictEqual(KDeskDimensions.toFormCentimeters('32in x 34in x 36in'), { length: 81.28, width: 86.36, height: 91.44 });
    assert.deepStrictEqual(KDeskDimensions.toFormCentimeters('120cm x 60cm x 90cm'), { length: 120, width: 60, height: 90 });
    assert.strictEqual(KDeskDimensions.toFormCentimeters('nonsense'), null);
  });
  console.log(passed + ' passed, ' + failed + ' failed');
  return { passed, failed };
}

// =============================================================================
// FURNITURE DIMENSIONS: page wiring (furniture-detail.html, ai-visualization.html, admin table)
// All reading / converting / validating / formatting lives in the KDeskDimensions block at the top of this file.
// This code only DRAWS the result. It never parses text and never reads image or container sizes.
// =============================================================================
export function resolveFurnitureDimensions(product) {
  if (typeof KDeskDimensions === 'undefined') {
    return { status: 'unavailable', reason: 'module_missing', message: 'KDeskDimensions not available', text: 'Dimensions unavailable', formatted: null, inches: null };
  }
  const result = KDeskDimensions.resolve(product);
  if (result.status !== 'valid') console.warn(`[K-Desk] Dimensions unavailable for "${product && product.name}": ${result.message}`);
  return result;
}

// Schematic box (NOT to scale). Labels come straight from the validated, formatted values.
function furnitureDimensionDiagramSvg(f) {
  const line = '#4b5563';
  const lbl = 'font-family="Inter,Segoe UI,Arial,sans-serif" font-size="12" font-weight="600" fill="#111827" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"';
  const arrows = 'stroke="' + line + '" stroke-width="1.5" marker-start="url(#kdArrowStart)" marker-end="url(#kdArrowEnd)"';
  return '<svg viewBox="0 0 335 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dimension diagram">' +
    '<defs><marker id="kdArrowEnd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + line + '"/></marker>' +
    '<marker id="kdArrowStart" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="' + line + '"/></marker></defs>' +
    '<polygon points="52,62 192,62 242,27 102,27" fill="#f3f4f6" stroke="' + line + '" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<polygon points="192,62 242,27 242,127 192,162" fill="#e5e7eb" stroke="' + line + '" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<rect x="52" y="62" width="140" height="100" fill="#ffffff" stroke="' + line + '" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<line x1="52" y1="180" x2="192" y2="180" ' + arrows + '/><text x="122" y="199" text-anchor="middle" ' + lbl + '>' + escapeHtmlText(f.width) + '</text>' +
    '<line x1="30" y1="62" x2="30" y2="162" ' + arrows + '/><text transform="translate(21 112) rotate(-90)" text-anchor="middle" ' + lbl + '>' + escapeHtmlText(f.height) + '</text>' +
    '<line x1="204" y1="172" x2="254" y2="137" ' + arrows + '/><text x="262" y="156" text-anchor="start" ' + lbl + '>' + escapeHtmlText(f.depth) + '</text>' +
    '</svg>';
}

export function renderFurnitureDimensions(product) {
  const dim = resolveFurnitureDimensions(product);
  const textEl = document.getElementById('productDimensions');
  if (textEl) textEl.textContent = dim.text;          // "Width: 32 in × Depth: 34 in × Height: 36 in" or "Dimensions unavailable"

  const frame = document.getElementById('dimFrame');
  if (!frame) return dim;
  const valid = dim.status === 'valid';
  const setRuler = (id, axisLabel, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !valid;
    if (valid) {
      el.querySelector('.dim-label').textContent = value;
      el.setAttribute('aria-label', axisLabel + ': ' + value);
    }
  };
  setRuler('dimWidth', 'Width', valid ? dim.formatted.width : '');
  setRuler('dimHeight', 'Height', valid ? dim.formatted.height : '');
  frame.classList.toggle('has-height', valid);

  const diagram = document.getElementById('dimDiagram');
  if (diagram) {
    diagram.hidden = !valid;
    if (valid) {
      diagram.querySelector('.dim-diagram-svg').innerHTML = furnitureDimensionDiagramSvg(dim.formatted);
      diagram.querySelector('.dim-legend').innerHTML = KDeskDimensions.AXES.map(a =>
        '<li><span class="dim-legend-name">' + KDeskDimensions.AXIS_LABEL[a] + '</span><span class="dim-legend-value">' + escapeHtmlText(dim.formatted[a]) + '</span></li>').join('');
    }
  }
  return dim;
}

// Admin furniture table: shows the saved text as-is.
export function adminDimensionCell(item) {
  return item.dimensions ? escapeHtmlText(item.dimensions) : 'N/A';
}

// =============================================================================
// ADMIN EDIT FURNITURE MODAL: dimension entry in feet or inches
// Storage is UNCHANGED: furniture.dimensions stays "<Length>cm x <Width>cm x <Height>cm" (same string, same
// meaning), so every other page, the details-page graphics and the AI visualizer keep working untouched.
// Conversion: 1 in = 2.54 cm, 1 ft = 12 in = 30.48 cm. Centimetres are saved to 2 decimals (0.01 cm).
// To prevent drift, a field the admin did not touch is saved from the ORIGINAL stored cm value, and changing the
// unit selector re-displays the same underlying cm value (it never converts an already-rounded display value).
// =============================================================================
const FURNITURE_DIM_FIELDS = [
  { id: 'furnitureLength', label: 'Length' },
  { id: 'furnitureWidth', label: 'Width' },
  { id: 'furnitureHeight', label: 'Height' }
];

const CM_PER_UNIT = { in: 2.54, ft: 30.48 };

const furnitureDimState = {};

       // { name, category } of the record being edited (for the type sanity check)

function furnitureDimToCm(value, unit) { return value * CM_PER_UNIT[unit]; }

function furnitureDimFromCm(cm, unit) { return cm / CM_PER_UNIT[unit]; }

function furnitureDimRoundCm(cm) { return Math.round(cm * 100) / 100; }

// Decimal stays decimal: 29.5 -> "29.5", 32 -> "32". More digits for feet so 1 ft steps are not lost to display rounding.
function furnitureDimDisplay(value, unit) { return String(Number(value.toFixed(unit === 'ft' ? 3 : 2))); }

function refreshFurnitureDimLabel(field) {
  const input = document.getElementById(field.id);
  const select = document.getElementById(field.id + 'Unit');
  if (!input || !select) return;
  const label = document.getElementById(field.id + 'Label');
  if (label) label.textContent = `${field.label} (${select.value})`;
  input.setAttribute('aria-label', `${field.label} in ${select.value === 'ft' ? 'feet' : 'inches'}`);
}

// Binds the unit dropdowns that live in admin.html (once). If an older admin.html without them is used, they are added.
function ensureFurnitureUnitControls() {
  FURNITURE_DIM_FIELDS.forEach(field => {
    const input = document.getElementById(field.id);
    if (!input) return;
    let select = document.getElementById(field.id + 'Unit');
    if (!select) {
      input.step = 'any'; input.min = '0';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:0.5rem;align-items:center;';
      input.parentNode.insertBefore(row, input);
      row.appendChild(input);
      select = document.createElement('select');
      select.id = field.id + 'Unit';
      select.className = input.className;
      select.style.cssText = 'flex:0 0 4.25rem;width:4.25rem;';
      select.innerHTML = '<option value="in" selected>in</option><option value="ft">ft</option>';
      row.appendChild(select);
      const lbl = row.previousElementSibling;
      if (lbl && lbl.tagName === 'LABEL') lbl.id = field.id + 'Label';
    }
    if (select.dataset.kdBound) return;
    select.dataset.kdBound = '1';
    furnitureDimState[field.id] = { cm: null, untouched: true };
    // typing: the entered number becomes the source of truth
    input.addEventListener('input', () => { furnitureDimState[field.id].untouched = false; });
    // unit change: show the SAME physical length in the new unit; the cm value underneath is never rounded or replaced
    select.dataset.unit = select.value;
    select.addEventListener('change', () => {
      const st = furnitureDimState[field.id];
      const newUnit = select.value, oldUnit = select.dataset.unit;
      const typed = Number(input.value);
      if (input.value.trim() !== '' && Number.isFinite(typed) && typed > 0) {
        const cm = st.untouched && st.cm !== null ? st.cm : furnitureDimToCm(typed, oldUnit);
        st.cm = cm;
        input.value = furnitureDimDisplay(furnitureDimFromCm(cm, newUnit), newUnit);
        st.untouched = true;   // the shown number is a rounded view of st.cm; keep saving from st.cm until the admin types again
      }
      select.dataset.unit = newUnit;
      refreshFurnitureDimLabel(field);
    });
  });
}

// Fills the three inputs from the stored string. Returns false when the saved text cannot be read.
export function fillFurnitureDimensionInputs(stored) {
  ensureFurnitureUnitControls();
  const cm = (stored && typeof KDeskDimensions !== 'undefined') ? KDeskDimensions.toFormCentimeters(stored) : null;
  const byField = cm ? { furnitureLength: cm.length, furnitureWidth: cm.width, furnitureHeight: cm.height } : null;
  FURNITURE_DIM_FIELDS.forEach(field => {
    const input = document.getElementById(field.id);
    const select = document.getElementById(field.id + 'Unit');
    if (!input || !select) return;
    select.value = 'in'; select.dataset.unit = 'in';
    const st = furnitureDimState[field.id];
    if (byField && byField[field.id] > 0) {
      st.cm = byField[field.id]; st.untouched = true;
      input.value = furnitureDimDisplay(furnitureDimFromCm(st.cm, 'in'), 'in');
    } else { st.cm = null; st.untouched = true; input.value = ''; }
    refreshFurnitureDimLabel(field);
  });
  return !!byField;
}

// Validates the three inputs. Returns { ok:true, cm:{furnitureLength,...} } or { ok:false, message }.
export function readFurnitureDimensionInputs() {
  const cm = {};
  for (const field of FURNITURE_DIM_FIELDS) {
    const input = document.getElementById(field.id);
    const unit = (document.getElementById(field.id + 'Unit') || { value: 'in' }).value;
    const raw = input ? input.value.trim() : '';
    if (raw === '') return { ok: false, message: `${field.label} is required (enter a number in ${unit === 'ft' ? 'feet' : 'inches'}).` };
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return { ok: false, message: `${field.label} must be a number greater than 0 (${unit === 'ft' ? 'feet' : 'inches'}).` };
    const st = furnitureDimState[field.id] || { cm: null, untouched: false };
    const exact = (st.untouched && st.cm !== null) ? st.cm : furnitureDimToCm(num, unit);
    cm[field.id] = furnitureDimRoundCm(exact);
    if (!(cm[field.id] > 0)) return { ok: false, message: `${field.label} is too small to save.` };
  }
  return { ok: true, cm };
}