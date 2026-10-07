#!/bin/sh
# Archive the iOS app and upload it to TestFlight (App Store Connect app
# "ABL Translate", team WRR3ADG534). Needs Xcode signed in to the developer
# account (Xcode → Settings → Accounts). Build number = upload time.
set -e
cd "$(dirname "$0")/.."
npx cap sync ios
rm -rf build/App.xcarchive build/export
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/App.xcarchive \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=WRR3ADG534 \
  CURRENT_PROJECT_VERSION="$(date +%Y%m%d%H%M)" archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
