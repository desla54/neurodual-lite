/**
 * Capture promo video from GSAP-animated HTML composition.
 *
 * Usage:
 *   node scripts/video-promo/capture.mjs [options]
 *
 * Options:
 *   --fps=60          Frame rate (default: 60)
 *   --crf=12          Quality 0-51, lower=better (default: 12)
 *   --output=NAME     Output filename without extension (default: promo-v2)
 *   --html=FILE       HTML composition file (default: promo.html)
 *   --port=3779       Local server port (default: 3779)
 *
 * Pipeline:
 *   1. Serve promo.html locally
 *   2. Open Chromium at 1080×1920
 *   3. Pause GSAP timeline, seek frame-by-frame, screenshot each as PNG
 *   4. Assemble PNGs into MP4 with ffmpeg (H.264, profile high, level 5.1)
 *
 * Output: output/<name>.mp4
 */

import { chromium } from '@playwright/test';
import { createServer } from 'http';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

// ── Parse args ──
function parseArgs() {
  const args = { fps: 60, crf: 12, output: 'promo-v2', html: 'promo.html', port: 3779 };
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    if (key in args) args[key] = isNaN(Number(val)) ? val : Number(val);
  }
  return args;
}

const CONFIG = parseArgs();
const WIDTH = 1080;
const HEIGHT = 1920;

const framesDir = resolve(__dirname, 'build/frames');
const outputDir = resolve(PROJECT_ROOT, 'output');
const outputMp4 = resolve(outputDir, `${CONFIG.output}.mp4`);

// ── Static file server ──
function startServer(port) {
  const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  };

  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const url = req.url === '/' ? `/${CONFIG.html}` : req.url;
      const filePath = resolve(__dirname, url.replace(/^\//, ''));

      try {
        const data = readFileSync(filePath);
        const mime = MIME[extname(filePath)] || 'application/octet-stream';
        resp.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
        resp.end(data);
      } catch {
        resp.writeHead(404);
        resp.end('Not found');
      }
    });

    server.listen(port, () => {
      console.log(`Server: http://localhost:${port}`);
      res(server);
    });
  });
}

// ── Main ──
async function main() {
  console.log(`Config: ${CONFIG.fps}fps, CRF ${CONFIG.crf}, ${WIDTH}×${HEIGHT}`);
  console.log(`Source: ${CONFIG.html}`);
  console.log(`Output: ${outputMp4}\n`);

  mkdirSync(framesDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  // Clean previous frames
  if (existsSync(framesDir)) {
    for (const f of readdirSync(framesDir)) {
      if (f.endsWith('.png')) execSync(`rm "${resolve(framesDir, f)}"`);
    }
  }

  const server = await startServer(CONFIG.port);

  const browser = await chromium.launch({
    args: ['--font-render-hinting=none', '--disable-lcd-text'],
  });

  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  console.log('Loading page...');
  await page.goto(`http://localhost:${CONFIG.port}/${CONFIG.html}`, { waitUntil: 'networkidle' });

  // Wait for fonts + GSAP ready
  await page.waitForFunction(() => window.__ready === true, { timeout: 15_000 });
  await page.waitForTimeout(300);

  // Read timeline duration from GSAP
  const durationSec = await page.evaluate(() => Math.ceil(window.__totalDuration));
  const totalFrames = CONFIG.fps * durationSec;

  console.log(`GSAP timeline: ${durationSec}s → ${totalFrames} frames\n`);
  console.log('Capturing frames...');
  const t0 = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    const timeSec = i / CONFIG.fps;

    // Seek GSAP timeline
    await page.evaluate((t) => { window.__timeline.time(t); }, timeSec);

    // Wait for render
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    const frameNum = String(i + 1).padStart(5, '0');
    await page.screenshot({
      path: resolve(framesDir, `frame_${frameNum}.png`),
      type: 'png',
    });

    if (i % CONFIG.fps === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const pct = ((i / totalFrames) * 100).toFixed(0);
      console.log(`  ${pct}% — ${i}/${totalFrames} frames (${elapsed}s)`);
    }
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  100% — ${totalFrames} frames captured in ${totalTime}s\n`);

  await browser.close();
  server.close();

  // ── Assemble with ffmpeg ──
  console.log('Assembling MP4...');
  execSync(
    `ffmpeg -y -framerate ${CONFIG.fps} ` +
    `-i "${framesDir}/frame_%05d.png" ` +
    `-c:v libx264 -pix_fmt yuv420p ` +
    `-crf ${CONFIG.crf} -preset veryslow ` +
    `-profile:v high -level 5.1 ` +
    `-movflags +faststart ` +
    `"${outputMp4}"`,
    { stdio: 'inherit' }
  );

  console.log(`\nDone! → ${outputMp4}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
