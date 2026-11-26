// jsdom harness for X-Now Downloader UI (frontend/downloader.html + frontend/downloader.js).
// Verifies pending context auto-inspect, multi-item navigation, format switching,
// theme switching, single/audio/bundle/text downloads, and keyboard shortcuts.
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'frontend', 'downloader.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'frontend', 'downloader.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ FAIL: ${label}`); }
}
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

const SAMPLE_POST = {
  tweetId: '1899999999999999999',
  username: 'eliza_huang',
  displayName: 'Eliza Huang',
  postUrl: 'https://x.com/eliza_huang/status/1899999999999999999',
  createdAt: '2026-11-20T10:30:00Z',
  text: 'Testing multi-media X post',
  ffmpegAvailable: true,
  items: [
    {
      index: 0,
      kind: 'video',
      thumbnailUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg',
      formats: [
        {
          id: 'mp4-0',
          label: '720p MP4 · 2176 kbps',
          width: 1280,
          height: 720,
          bandwidth: 2176000,
          ext: 'mp4',
          requiresMux: false,
          videoUrl: 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/hd.mp4',
          audioUrl: null
        },
        {
          id: 'mp4-1',
          label: '360p MP4 · 832 kbps',
          width: 640,
          height: 360,
          bandwidth: 832000,
          ext: 'mp4',
          requiresMux: false,
          videoUrl: 'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/sd.mp4',
          audioUrl: null
        }
      ]
    },
    {
      index: 1,
      kind: 'image',
      thumbnailUrl: 'https://pbs.twimg.com/media/ABC?format=png&name=small',
      formats: [
        {
          id: 'img-orig-0',
          label: '1600x900 Original PNG',
          width: 1600,
          height: 900,
          bandwidth: 4000000,
          ext: 'png',
          requiresMux: false,
          videoUrl: 'https://pbs.twimg.com/media/ABC?format=png&name=orig',
          audioUrl: null
        },
        {
          id: 'img-jpg-0',
          label: '1600x900 Original JPG',
          width: 1600,
          height: 900,
          bandwidth: 3800000,
          ext: 'jpg',
          requiresMux: false,
          videoUrl: 'https://pbs.twimg.com/media/ABC?format=jpg&name=orig',
          audioUrl: null
        }
      ]
    }
  ]
};

async function main() {
  const htmlOnly = HTML.replace('<script src="downloader.js"></script>', '');
  const dom = new JSDOM(htmlOnly, {
    runScripts: 'dangerously',
    url: 'http://tauri.localhost/downloader.html',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const { document } = window;

  const calls = [];
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        calls.push({ cmd, args });
        if (cmd === 'take_pending_downloader_context') {
          return {
            url: SAMPLE_POST.postUrl,
            payloadJson: '{"xnowSeed":true}',
            itemIndex: 0,
            theme: 'dim'
          };
        }
        if (cmd === 'inspect_x_post') {
          if (String(args.url || '').includes('gif_only')) {
            return {
              ...SAMPLE_POST,
              tweetId: '222333444',
              postUrl: 'https://x.com/eliza_huang/status/222333444',
              items: [{
                index: 0,
                kind: 'gif',
                thumbnailUrl: 'https://pbs.twimg.com/tweet_video_thumb/GIF.jpg',
                formats: [{
                  id: 'gif-convert',
                  label: 'Animated GIF (.gif, Authentic Quality)',
                  width: 640,
                  height: 360,
                  bandwidth: 500000,
                  ext: 'gif',
                  requiresMux: true,
                  videoUrl: 'https://video.twimg.com/tweet_video/GIF.mp4',
                  audioUrl: null
                }]
              }]
            };
          }
          return SAMPLE_POST;
        }
        if (cmd === 'download_post_selection') {
          if (args.mode === 'bundle') {
            return {
              savedPaths: ['C:\\Downloads\\X-Now\\a\\1.mp4', 'C:\\Downloads\\X-Now\\a\\2.png'],
              textPath: 'C:\\Downloads\\X-Now\\a\\post.txt',
              metadataPath: 'C:\\Downloads\\X-Now\\a\\metadata.json',
              subfolder: 'eliza_huang-20261120-1899999999999999999',
              warning: null
            };
          }
          return {
            savedPaths: ['C:\\Downloads\\X-Now\\eliza_huang-20261120-1899999999999999999-item-1.mp4'],
            textPath: null,
            metadataPath: null,
            subfolder: null,
            warning: null
          };
        }
        if (cmd === 'save_post_text') {
          return 'C:\\Downloads\\X-Now\\eliza_huang-20261120-1899999999999999999.txt';
        }
        if (cmd === 'open_downloads_folder') return undefined;
        throw new Error(`Unexpected command: ${cmd}`);
      }
    },
    event: { listen: async () => () => {} }
  };

  window.eval(JS);
  await tick(60);

  assert(document.documentElement.dataset.theme === 'dim', 'pending theme applied on open');
  assert(calls.some(c => c.cmd === 'inspect_x_post'), 'pending context auto-inspects');
  assert(document.getElementById('url-input').value === SAMPLE_POST.postUrl, 'URL input populated');
  assert(document.getElementById('caption-input').value === 'Testing multi-media X post', 'post text populated');
  assert(document.getElementById('engine-badge').textContent.includes('FFmpeg'), 'FFmpeg badge updated');
  assert(document.getElementById('slide-strip').hidden === false, 'multi-item thumbnail strip shown');
  assert(document.getElementById('download-selected-label').textContent === 'Download Item 1 (.mp4)',
    'primary download label matches video item 1');
  assert(document.getElementById('download-audio-btn').disabled === false, 'audio button enabled for video');

  // Switch to item 2 (image .png)
  document.getElementById('next-slide-btn').click();
  await tick(20);
  assert(document.getElementById('slide-select').value === '1', 'next-slide-btn selects item 2');
  assert(document.getElementById('download-selected-label').textContent === 'Download Item 2 (.png)',
    'primary download label updates to .png for image item 2');
  assert(document.getElementById('download-audio-btn').disabled === true, 'audio button disabled on image item');
  assert(document.getElementById('output-name-preview').textContent.endsWith('-item-2.png'),
    'output stem reflects item 2 extension');

  // Preview zoom slider & keyboard shortcuts for images
  const zoomBar = document.getElementById('preview-zoom-bar');
  const zoomSlider = document.getElementById('preview-zoom-slider');
  const zoomLabel = document.getElementById('preview-zoom-label');
  assert(zoomBar.hidden === false, 'preview zoom bar shown on image item');
  zoomSlider.value = '200';
  zoomSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert(zoomLabel.textContent === '200%', 'preview zoom slider updates percentage label');
  assert(document.getElementById('preview-thumb').style.transform.includes('scale(2)'),
    'preview zoom applies CSS scale transform');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }));
  assert(zoomLabel.textContent === '215%', '+ key zooms downloader image preview in');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }));
  assert(zoomLabel.textContent === '100%', '0 key resets downloader image zoom to Fit');

  // Changing image format updates preview badge
  const fmtSelect = document.getElementById('format-select');
  fmtSelect.value = 'img-jpg-0';
  fmtSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(document.getElementById('preview-tag').textContent === '2 / 2 JPG',
    'changing image format updates preview badge to JPG');

  // ArrowRight inside focused range slider must not step away from slide 2
  zoomSlider.focus();
  zoomSlider.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert(document.getElementById('slide-select').value === '1',
    'ArrowRight on focused zoom slider keeps current slide');

  // Switching back to video item hides zoom bar
  document.getElementById('prev-slide-btn').click();
  await tick(20);
  assert(zoomBar.hidden === true, 'preview zoom bar hidden on video item');

  // Switch theme to Light, then test keyboard ArrowRight wrapping back to Black
  const lightThemeBtn = document.querySelector('[data-theme-pick="light"]');
  lightThemeBtn.click();
  assert(document.documentElement.dataset.theme === 'light', 'theme switch updates data-theme');
  assert(lightThemeBtn.getAttribute('aria-checked') === 'true',
    'theme radio aria-checked updated');
  lightThemeBtn.focus();
  lightThemeBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert(document.documentElement.dataset.theme === 'black', 'theme radiogroup ArrowRight wraps to Black');

  // Trigger single, bundle, and text save
  document.getElementById('prev-slide-btn').click();
  document.getElementById('download-selected-btn').click();
  await tick(30);
  assert(calls.some(c => c.cmd === 'download_post_selection' && c.args.mode === 'single'),
    'single download invokes download_post_selection');

  document.getElementById('download-bundle-btn').click();
  await tick(30);
  assert(calls.some(c => c.cmd === 'download_post_selection' && c.args.mode === 'bundle'),
    'bundle download invokes download_post_selection');
  assert(document.getElementById('status-box').textContent.includes('post.txt'),
    'bundle status mentions post.txt');
  assert(document.getElementById('status-open-btn').hidden === false, 'Open Folder button shown after save');

  document.getElementById('save-caption-btn').click();
  await tick(30);
  assert(calls.some(c => c.cmd === 'save_post_text'), 'Save (.txt) invokes save_post_text');

  // GIF-only post hides and disables Audio Only (.m4a)
  document.getElementById('url-input').value = 'https://x.com/eliza_huang/status/222333444?gif_only=1';
  document.getElementById('inspect-btn').click();
  await tick(40);
  assert(document.getElementById('download-audio-btn').hidden === true, 'audio button hidden on GIF-only post');
  assert(document.getElementById('download-audio-btn').disabled === true, 'audio button disabled on GIF-only post');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
