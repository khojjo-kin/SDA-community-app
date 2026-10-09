// Adds the build number from the environment so every TestFlight upload gets a new one.
module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, buildNumber: process.env.BUILD_NUMBER || '1' },
});
