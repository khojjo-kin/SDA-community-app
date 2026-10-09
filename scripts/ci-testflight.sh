#!/bin/bash
# Builds the iPhone app with Xcode and uploads it to TestFlight.
#
# Needs: ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, BUILD_NUMBER.
# Optional: SIGN_DIR with dist.p12 (the private key), dist.cer and app.mobileprovision.
#
# The app is compiled once, unsigned. Signing happens when the archive is exported, first with
# the distribution certificate and App Store profile saved in the repository, then, if that is
# refused, with a certificate Xcode manages in the cloud. A second compile only happens when
# every way of signing the first archive has failed.
set -u
LOG_DIR="${LOG_DIR:-$RUNNER_TEMP/logs}"
mkdir -p "$LOG_DIR"
S="$LOG_DIR/status.txt"
TEAM=QRMLKZR9B8
BUNDLE=Kojo.SDAAPPGEMINI
PROJECT=ios/Community.xcodeproj/project.pbxproj

say() { echo "$*" >> "$S"; }
finish() { say "RESULT: $1"; say "finished $(date -u +%FT%TZ)"; exit "$2"; }

echo "started $(date -u +%FT%TZ) build $BUILD_NUMBER" > "$S"
xcodebuild -version >> "$S" 2>&1
sw_vers >> "$S" 2>&1

keep() { # keep the useful part of a long log: every error line plus the last 250 lines
  { echo "=== errors"; grep -n -E "error:|Error:|\*\* .* FAILED|ERROR ITMS|exportArchive|Provisioning|signing" "$1" | tail -120; echo "=== tail"; tail -250 "$1"; } > "$2" 2>/dev/null
}

npm install --no-audit --no-fund > "$LOG_DIR/npm-install.log" 2>&1
code=$?; say "npm install: $code"
[ $code -ne 0 ] && finish "FAILED (the packages did not install: see npm-install.log)" $code

CI=1 npx expo prebuild --platform ios --clean > "$LOG_DIR/prebuild.log" 2>&1
code=$?; say "expo prebuild: $code"
[ $code -ne 0 ] && finish "FAILED (the Xcode project was not created: see prebuild.log)" $code
ls ios >> "$S"
[ -d ios/Community.xcworkspace ] || finish "FAILED (CocoaPods did not install: see the end of prebuild.log)" 1
cp "$PROJECT" "$RUNNER_TEMP/project.pbxproj.orig"

ARCHIVE="$RUNNER_TEMP/Community.xcarchive"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

# ---------- the saved certificate and profile ----------

MANUAL=0
PROFILE_NAME=""
PROFILE_UUID=""
KEYCHAIN="$RUNNER_TEMP/community-signing.keychain-db"

setup_signing() {
  local dir="${SIGN_DIR:-}"
  if [ -z "$dir" ] || [ ! -s "$dir/dist.p12" ] || [ ! -s "$dir/dist.cer" ] || [ ! -s "$dir/app.mobileprovision" ]; then
    say "saved certificate: not found, Xcode will manage signing"
    return 1
  fi
  local pass
  pass="$(uuidgen)"
  security delete-keychain "$KEYCHAIN" > /dev/null 2>&1
  security create-keychain -p "$pass" "$KEYCHAIN" || return 1
  security set-keychain-settings -lut 21600 "$KEYCHAIN"
  security unlock-keychain -p "$pass" "$KEYCHAIN" || return 1

  # Apple's intermediate certificate, in case this Mac does not have it yet.
  if curl -fsSL --max-time 30 https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer -o "$dir/wwdr.cer" 2> /dev/null; then
    security import "$dir/wwdr.cer" -k "$KEYCHAIN" > /dev/null 2>&1
  fi

  # dist.p12 is a plain PEM private key (fastlane names it .p12). Import the key and the certificate
  # as they are; if this Mac refuses, wrap both in a real .p12 first.
  if ! security import "$dir/dist.p12" -k "$KEYCHAIN" -P "" -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild > /dev/null 2>&1 ||
    ! security import "$dir/dist.cer" -k "$KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security > /dev/null 2>&1; then
    /usr/bin/openssl x509 -inform der -in "$dir/dist.cer" -out "$dir/dist.pem" 2> /dev/null
    /usr/bin/openssl pkcs12 -export -inkey "$dir/dist.p12" -in "$dir/dist.pem" -out "$dir/bundle.p12" -passout "pass:$pass" 2> /dev/null
    security import "$dir/bundle.p12" -k "$KEYCHAIN" -P "$pass" -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security > /dev/null 2>&1
  fi
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$pass" "$KEYCHAIN" > /dev/null 2>&1

  # Put this keychain first in the search list, keeping the ones already there.
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
  security find-identity -v -p codesigning "$KEYCHAIN" > "$LOG_DIR/identities.txt" 2>&1
  if ! grep -q "Distribution" "$LOG_DIR/identities.txt"; then
    say "saved certificate: did not import, Xcode will manage signing"
    return 1
  fi

  security cms -D -i "$dir/app.mobileprovision" > "$dir/profile.plist" 2> /dev/null || return 1
  PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$dir/profile.plist" 2> /dev/null)"
  PROFILE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$dir/profile.plist" 2> /dev/null)"
  if [ -z "$PROFILE_UUID" ] || [ -z "$PROFILE_NAME" ]; then
    say "saved profile: could not be read, Xcode will manage signing"
    return 1
  fi
  local where
  for where in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
    mkdir -p "$where" && cp "$dir/app.mobileprovision" "$where/$PROFILE_UUID.mobileprovision"
  done
  say "saved certificate: ready, profile \"$PROFILE_NAME\" expires $(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$dir/profile.plist" 2> /dev/null)"

  local dest
  for dest in upload export; do
    cat > "$RUNNER_TEMP/ExportManual-$dest.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>$dest</string>
  <key>teamID</key>
  <string>$TEAM</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE</key>
    <string>$PROFILE_NAME</string>
  </dict>
  <key>manageAppVersionAndBuildNumber</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
  done
  return 0
}

setup_signing && MANUAL=1

# ---------- building blocks ----------

archive() { # $1 = name, rest = extra xcodebuild settings (always at least one)
  local name="$1"; shift
  rm -rf "$ARCHIVE"
  xcodebuild -workspace ios/Community.xcworkspace -scheme Community -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive "$@" > "$RUNNER_TEMP/$name.full.log" 2>&1
  local code=$?
  keep "$RUNNER_TEMP/$name.full.log" "$LOG_DIR/$name.log"
  say "$name: $code"
  return $code
}

export_with() { # $1 = name, $2 = export options file
  rm -rf "$RUNNER_TEMP/export"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$2" \
    -exportPath "$RUNNER_TEMP/export" "${AUTH[@]}" > "$RUNNER_TEMP/$1.full.log" 2>&1
  local code=$?
  keep "$RUNNER_TEMP/$1.full.log" "$LOG_DIR/$1.log"
  say "$1: $code"
  return $code
}

upload_saved() { export_with "$1" "$RUNNER_TEMP/ExportManual-upload.plist"; } # sign with the saved certificate, then upload
upload_cloud() { export_with "$1" scripts/ExportOptions.plist; }               # let Xcode sign in the cloud, then upload

SIGNED=0 # becomes 1 once the saved certificate has produced a signed .ipa

upload_ipa() { # $1 = name. Sign with the saved certificate into an .ipa file, then send that file.
  export_with "$1-export" "$RUNNER_TEMP/ExportManual-export.plist" || return 1
  local ipa
  ipa="$(ls "$RUNNER_TEMP"/export/*.ipa 2> /dev/null | head -1)"
  [ -n "$ipa" ] || { say "$1: no .ipa was produced"; return 1; }
  SIGNED=1
  mkdir -p "$HOME/.appstoreconnect/private_keys"
  cp "$ASC_KEY_PATH" "$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
  xcrun altool --upload-app --type ios --file "$ipa" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" > "$RUNNER_TEMP/$1.full.log" 2>&1
  local code=$?
  rm -f "$HOME/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8"
  keep "$RUNNER_TEMP/$1.full.log" "$LOG_DIR/$1.log"
  say "$1: $code"
  return $code
}

use_saved_profile() { # set the app target to sign with the saved profile, the way Expo's own build service does
  PROFILE_NAME="$PROFILE_NAME" TEAM="$TEAM" node -e "
    const { IOSConfig } = require('expo/config-plugins');
    IOSConfig.ProvisioningProfile.setProvisioningProfileForPbxproj(process.cwd(), { profileName: process.env.PROFILE_NAME, appleTeamId: process.env.TEAM, buildConfiguration: 'Release' });
  " >> "$LOG_DIR/prebuild.log" 2>&1
}

# ---------- 1. compile once, unsigned ----------

unsigned() { archive archive-unsigned CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" COMPILER_INDEX_STORE_ENABLE=NO; }

if ! unsigned; then
  if grep -q "is not installed" "$RUNNER_TEMP/archive-unsigned.full.log"; then
    # This Xcode came without the iOS platform. Fetch it once, then compile again.
    say "this Xcode has no iOS platform installed: downloading it"
    xcodebuild -downloadPlatform iOS > "$LOG_DIR/download-platform.log" 2>&1
    say "download platform: $?"
    unsigned || finish "FAILED (the app did not compile: see archive-unsigned.log)" 1
  else
    finish "FAILED (the app did not compile: see archive-unsigned.log)" 1
  fi
fi

# ---------- 2. sign and upload that archive ----------

if [ "$MANUAL" = 1 ]; then
  upload_saved upload-saved && finish "uploaded to App Store Connect (signed with the saved certificate)" 0
  upload_ipa upload-ipa && finish "uploaded to App Store Connect (signed with the saved certificate, sent as an .ipa)" 0
fi
upload_cloud upload-cloud && finish "uploaded to App Store Connect (signed by Xcode at export)" 0

# Signing worked, so compiling again would not help: App Store Connect itself said no.
[ "$SIGNED" = 1 ] && finish "FAILED (built and signed, but App Store Connect refused the upload: see upload-ipa.log)" 1

# ---------- 3. last resorts: compile again, signed ----------

if [ "$MANUAL" = 1 ] && use_saved_profile && archive archive-saved COMPILER_INDEX_STORE_ENABLE=NO; then
  upload_saved upload-saved-2 && finish "uploaded to App Store Connect (archive signed with the saved certificate)" 0
  upload_ipa upload-ipa-2 && finish "uploaded to App Store Connect (archive signed with the saved certificate, sent as an .ipa)" 0
  [ "$SIGNED" = 1 ] && finish "FAILED (built and signed, but App Store Connect refused the upload: see upload-ipa-2.log)" 1
fi
cp "$RUNNER_TEMP/project.pbxproj.orig" "$PROJECT"

if archive archive-signed "${AUTH[@]}" DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic COMPILER_INDEX_STORE_ENABLE=NO && upload_cloud upload-cloud-2; then
  finish "uploaded to App Store Connect (automatic signing)" 0
fi

finish "FAILED (the app compiled, but could not be signed or uploaded: see the upload logs)" 1
