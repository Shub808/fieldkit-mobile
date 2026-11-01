const expoConfig = require("eslint-config-expo/flat");

/** Expo's flat config, plus the generated and build directories. */
module.exports = [
  ...expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "node_modules/*", "coverage/*"],
  },
];
