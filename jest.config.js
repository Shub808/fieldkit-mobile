/**
 * Jest configuration.
 *
 * Two projects, because the two halves of this codebase have genuinely
 * different needs:
 *
 *  - `domain` runs the offline model, the merge and the sync engine in plain
 *    Node. They import nothing from React Native, which is the whole reason
 *    they can be tested exhaustively without a simulator.
 *  - `ui` runs component tests under `jest-expo`, which provides the React
 *    Native preset and the Expo module mocks.
 */
module.exports = {
  projects: [
    {
      displayName: "domain",
      testEnvironment: "node",
      testMatch: ["<rootDir>/__tests__/unit/**/*.test.ts"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
    },
    {
      displayName: "ui",
      preset: "jest-expo",
      testMatch: ["<rootDir>/__tests__/components/**/*.test.tsx"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
      setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],
      transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
      ],
    },
  ],
};
