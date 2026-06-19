// Central config for the content tool (master storage spec §1.2/§1.4, rights §2.4).
// Everything that the spec calls a "parameter" lives here so wording, paths, and the
// storage backend can change in ONE place. The license *stance* is fixed (All Rights
// Reserved); only phrasing/year are meant to be edited.

// --- Master storage (§1.2) ---
// Masters land OUTSIDE the deployed repo. Default per spec; override with MASTERS_DIR.
export const MASTERS_DIR = process.env.MASTERS_DIR || 'D:/Photo_Portfolio_Masters';

// Storage backend selector (§1.4). 'local' now; 'r2' is the Phase-2 hook (stubbed).
export const STORE = process.env.STORE || 'local';

// --- Web derivative resolution cap (§2.1) ---
// The real protection: generous for full-screen viewing, insufficient for a quality
// large print. Applied to the LONG edge so portraits are capped too.
export const MAX_LONG_EDGE = Number(process.env.MAX_LONG_EDGE) || 2560;

// --- Rights / licensing (§2.4 — locked: © All Rights Reserved) ---
// Values baked into every web derivative via ExifTool (see rights.js) and shown in the
// visible footer + /license page. Year is computed so the notice stays current; pin it
// by editing COPYRIGHT_YEAR if you prefer a fixed first-publication year.
const COPYRIGHT_YEAR = new Date().getFullYear();

export const RIGHTS = {
  author: 'Jeremy Ivan',
  siteUrl: 'https://jeremyivan.photo',          // TODO: confirm final production URL
  licenseUrl: 'https://jeremyivan.photo/license', // WebStatement target (§2.3)
  year: COPYRIGHT_YEAR,
  marked: true,                                  // xmpRights:Marked = True (rights asserted)
  copyrightNotice: `© ${COPYRIGHT_YEAR} Jeremy Ivan. All rights reserved.`,
  credit: 'Jeremy Ivan',
  usageTerms:
    '© Jeremy Ivan. All rights reserved. This is a web-resolution display copy. ' +
    'No reproduction, redistribution, or commercial use without permission. ' +
    'Attribution required if shared. Print-quality files and licensing available by ' +
    'purchase — see https://jeremyivan.photo/license.',
};

// Short line for the visible site footer (§2.4.1).
export const FOOTER_LINE = `© ${COPYRIGHT_YEAR} Jeremy Ivan · All rights reserved`;
