module.exports = {
  root: true,
  extends: ['next', 'turbo'],
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    "@next/next/no-html-link-for-pages": "off",
  },
};
