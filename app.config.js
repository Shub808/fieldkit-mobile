// Dynamic config so the same code deploys at a domain root (Vercel) or under a
// sub-path (GitHub Pages: EXPO_BASE_URL=/fieldkit-mobile).
const base = require("./app.base.json");

module.exports = () => {
  const baseUrl = process.env.EXPO_BASE_URL;
  const expo = { ...base.expo };
  if (baseUrl) expo.experiments = { ...expo.experiments, baseUrl };
  return { expo };
};
