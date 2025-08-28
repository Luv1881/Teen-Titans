const path = require('path');

module.exports = {
  content: [
    path.join(__dirname, '../../apps/web/src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
