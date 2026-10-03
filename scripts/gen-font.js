/* eslint-disable */
/**
 * Converts Lilita One (the game's display font) into a three.js typeface JSON
 * containing only the glyphs used by 3D labels. Output: src/render/fonts/lilita.json
 * Run: node scripts/gen-font.js
 */
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const ttf = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'lilita-one', '400Regular', 'LilitaOne_400Regular.ttf');
const buf = fs.readFileSync(ttf);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const CHARS = '0123456789+-x÷%?<>.,:!/×= ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const r = (v) => Math.round(v);

const glyphs = {};
for (const ch of CHARS) {
  const g = font.charToGlyph(ch);
  const p = g.getPath(0, 0, font.unitsPerEm);
  let o = '';
  for (const c of p.commands) {
    // three.js FontLoader: y up, end point first, then control points.
    switch (c.type) {
      case 'M': o += `m ${r(c.x)} ${r(-c.y)} `; break;
      case 'L': o += `l ${r(c.x)} ${r(-c.y)} `; break;
      case 'Q': o += `q ${r(c.x)} ${r(-c.y)} ${r(c.x1)} ${r(-c.y1)} `; break;
      case 'C': o += `b ${r(c.x)} ${r(-c.y)} ${r(c.x1)} ${r(-c.y1)} ${r(c.x2)} ${r(-c.y2)} `; break;
    }
  }
  const bb = g.getBoundingBox();
  glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o: o.trim() };
}
const out = {
  glyphs,
  familyName: 'Lilita One',
  ascender: font.ascender,
  descender: font.descender,
  underlinePosition: font.tables.post.underlinePosition,
  underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: font.tables.head.xMin, yMin: font.tables.head.yMin, xMax: font.tables.head.xMax, yMax: font.tables.head.yMax },
  resolution: font.unitsPerEm,
  original_font_information: { license: 'SIL Open Font License 1.1 (Lilita One by Juan Montoreano)' },
};
const dest = path.join(__dirname, '..', 'src', 'render', 'fonts', 'lilita.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log('wrote', dest, (fs.statSync(dest).size / 1024).toFixed(1) + 'KB', Object.keys(glyphs).length, 'glyphs');
