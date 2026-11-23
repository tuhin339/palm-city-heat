// Palm City Heat — the hand-in program for our gta6-01 entry (Node 22, standard library only).
// The game itself lives in this directory's game/ folder: Palm City Heat, an original top-down
// open-world crime game written as plain static files (game/index.html plus the ES modules under
// game/src/) that a desktop browser loads fully offline — no library, no asset files, no network
// request. This program is the courier, not the game: it copies game/ and the screenshots/ folder
// from beside this file into the output directory and writes dossier.json there with the vendored
// make.fun library, and that dossier is the summary the judge reads.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080 in a browser.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';
import { readdirSync, statSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Hand-in self-check (added for Palm City Heat): the dossier above is already written, so this
// pass only reads the output directory back and holds it against the same caps the dossier was
// built with. A breach stops the run with an error naming it, long before a scorer has to refuse
// the entry; a clean pass prints a single summary line and changes nothing.

const HAND_IN_CAPS = { shotMaxFiles: 4, shotMaxBytes: 262144, gameMaxFiles: 993, gameMaxBytes: 50331648, gamePathMaxBytes: 1000 };

/** Every file under `root`, named by its path relative to `root`, gathered recursively. */
function collectHandInFiles(root) {
  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile()) found.push({ rel, full: join(dir, entry.name) });
    }
  };
  walk(root, '');
  return found;
}

function verifyHandIn(outputDir) {
  const shotsDir = join(outputDir, 'screenshots');
  const shots = existsSync(shotsDir) ? collectHandInFiles(shotsDir) : [];
  if (shots.length > HAND_IN_CAPS.shotMaxFiles) {
    throw new Error(`hand-in check failed: ${shots.length} screenshots exceed the cap of ${HAND_IN_CAPS.shotMaxFiles}`);
  }
  for (const shot of shots) {
    const size = statSync(shot.full).size;
    if (size > HAND_IN_CAPS.shotMaxBytes) {
      throw new Error(`hand-in check failed: screenshot ${shot.rel} is ${size} bytes, over the ${HAND_IN_CAPS.shotMaxBytes}-byte cap`);
    }
  }

  const gameFiles = collectHandInFiles(join(outputDir, 'game'));
  if (gameFiles.length > HAND_IN_CAPS.gameMaxFiles) {
    throw new Error(`hand-in check failed: ${gameFiles.length} game files exceed the cap of ${HAND_IN_CAPS.gameMaxFiles}`);
  }
  let gameBytes = 0;
  for (const file of gameFiles) {
    gameBytes += statSync(file.full).size;
    const pathBytes = Buffer.byteLength(file.rel, 'utf8');
    if (pathBytes > HAND_IN_CAPS.gamePathMaxBytes) {
      throw new Error(`hand-in check failed: game path ${file.rel} is ${pathBytes} bytes, over the ${HAND_IN_CAPS.gamePathMaxBytes}-byte cap`);
    }
  }
  if (gameBytes > HAND_IN_CAPS.gameMaxBytes) {
    throw new Error(`hand-in check failed: game files total ${gameBytes} bytes, over the ${HAND_IN_CAPS.gameMaxBytes}-byte cap`);
  }

  console.log(`hand-in verified: ${gameFiles.length} game files (${gameBytes} bytes), ${shots.length} screenshots, dossier.json written`);
}

verifyHandIn(out);
