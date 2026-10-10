// The fmt library that React Native 0.81 pins (11.0.2) does not compile under the stricter
// consteval rules of Xcode 26.4 and newer. Building just fmt as C++17 skips consteval entirely,
// and fmt checks format strings at run time instead; every other pod keeps C++20. Remove this
// plugin once React Native brings fmt 12 (0.83.9 and later).
// https://github.com/facebook/react-native/issues/55601
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SNIPPET = `
    # Added by plugins/fmt-on-new-xcode.js — see that file for why.
    installer.pods_project.targets.each do |t|
      next unless t.name == 'fmt'
      t.build_configurations.each { |c| c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17' }
    end
`;

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let text = fs.readFileSync(podfile, 'utf8');
      if (!text.includes('fmt-on-new-xcode')) {
        text = text.replace('post_install do |installer|', 'post_install do |installer|' + SNIPPET);
        fs.writeFileSync(podfile, text);
      }
      return cfg;
    },
  ]);
