// Every upload to App Store Connect needs a build number higher than the last one for this version.
// The GitHub workflow sets BUILD_NUMBER from its run number. When building from Xcode on your own
// machine, raise the fallback below (or run `BUILD_NUMBER=104 npx expo prebuild --platform ios`)
// before each upload. The last build sent from the workflow was 102.
module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, buildNumber: process.env.BUILD_NUMBER || '103' },
});
