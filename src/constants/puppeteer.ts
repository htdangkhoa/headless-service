export const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1080,
};

export const DEFAULT_LAUNCH_ARGS = [
  '--no-first-run',
  '--no-startup-window',
  '--mute-audio',
  '--disable-features=site-per-process',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--no-zygote',
  '--disable-dev-shm-usage',
  `--window-size=${DEFAULT_VIEWPORT.width},${DEFAULT_VIEWPORT.height}`,
];
