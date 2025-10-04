// import './index.css';

import { ScreencastApp } from './screencast-app';

window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  ScreencastApp.getInstance().render(app!);

  document.addEventListener('contextmenu', (event) => event.preventDefault());
});
