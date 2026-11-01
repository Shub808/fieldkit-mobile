/**
 * Babel is used by Metro for the app and by Jest for the test suites.
 * `babel-preset-expo` carries the React Native transform plus Expo Router's
 * `@/*` alias handling.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
