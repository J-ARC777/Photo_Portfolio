// Rights / licensing metadata (§2.2) — bake IPTC/XMP into every web derivative.
//
// HONEST FRAMING (§2.1): embedded metadata is a claim + attribution aid, NOT DRM — it is
// trivially strippable. The real protection is the resolution cap (derive.js). We bake it
// anyway because it documents rights and travels with the file when not removed.
//
// Sharp strips metadata by default, and its XMP-rights write support is limited, so we use
// ExifTool (industry standard) as a post-derivation step. ExifTool is an EXTERNAL binary,
// not an npm dep. If it is not installed we DEGRADE GRACEFULLY: derivation still completes,
// and the caller surfaces a one-time warning. Installing ExifTool later activates baking
// with no code change.
//   Install:  winget install -e --id OliverBetz.ExifTool   (or)   choco install exiftool

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RIGHTS } from './config.js';

const exec = promisify(execFile);

let _available = null; // cache: null = unknown, true/false once probed
let _warned = false;

export async function exiftoolAvailable() {
  if (_available !== null) return _available;
  try {
    await exec('exiftool', ['-ver']);
    _available = true;
  } catch {
    _available = false;
  }
  return _available;
}

export const RIGHTS_INSTALL_HINT =
  'ExifTool not found — rights metadata NOT embedded (the resolution cap + visible ' +
  'footer + manifest claim still apply). Install to enable: ' +
  '`winget install -e --id OliverBetz.ExifTool` or `choco install exiftool`.';

// The ExifTool args that write the §2.4 All-Rights-Reserved fields. Values from config.
function rightsArgs() {
  const r = RIGHTS;
  return [
    '-overwrite_original',
    '-codedcharacterset=utf8',
    `-XMP-dc:Creator=${r.author}`,
    `-IPTC:By-line=${r.author}`,
    `-XMP-dc:Rights=${r.copyrightNotice}`,
    `-IPTC:CopyrightNotice=${r.copyrightNotice}`,
    `-EXIF:Copyright=${r.copyrightNotice}`,
    `-IPTC:Credit=${r.credit}`,
    `-XMP-xmpRights:UsageTerms=${r.usageTerms}`,
    `-XMP-xmpRights:WebStatement=${r.licenseUrl}`,
    `-XMP-xmpRights:Marked=${r.marked ? 'True' : 'False'}`,
    `-XMP-plus:LicensorURL=${r.siteUrl}`,
    // C2PA / Content Credentials (cryptographic provenance) — forward-looking hook only,
    // intentionally NOT implemented here (§2.2).
  ];
}

// Bake rights into one or more files. Returns { baked, skipped, reason, count }.
export async function bakeRights(filePaths) {
  const files = Array.isArray(filePaths) ? filePaths : [filePaths];
  if (!files.length) return { baked: false, skipped: true, reason: 'no files', count: 0 };

  if (!(await exiftoolAvailable())) {
    if (!_warned) { console.warn(`  ⚠  ${RIGHTS_INSTALL_HINT}`); _warned = true; }
    return { baked: false, skipped: true, reason: RIGHTS_INSTALL_HINT, count: 0 };
  }

  // one exiftool invocation handles all files (faster than per-file spawn)
  await exec('exiftool', [...rightsArgs(), ...files]);
  return { baked: true, skipped: false, count: files.length };
}
