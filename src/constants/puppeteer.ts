export const DEFAULT_LAUNCH_ARGS = [
  '--no-first-run',
  '--no-startup-window',
  '--no-sandbox',
  '--disable-features=site-per-process',
  '--disable-setuid-sandbox',
  '--no-zygote',
  '--disable-dev-shm-usage',
  /* Disable animations to reduce time waiting for animations to complete */
  '--disable-modal-animations',
  '--wm-window-animations-disabled',
  '--disable-popup-blocking',
  '--disable-software-rasterizer',
];
