import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

import tailwindcssConfig from './tailwind.config.js';

export default {
  plugins: [tailwindcss(tailwindcssConfig), autoprefixer()],
};
