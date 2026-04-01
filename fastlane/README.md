fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android metadata

```sh
[bundle exec] fastlane android metadata
```

Push metadata (descriptions, changelogs) to Google Play — no binary upload

### android screenshots

```sh
[bundle exec] fastlane android screenshots
```

Upload screenshots to Google Play

### android screenshots_locale

```sh
[bundle exec] fastlane android screenshots_locale
```

Upload screenshots to Google Play for a single locale

### android deploy

```sh
[bundle exec] fastlane android deploy
```

Upload AAB to Google Play internal track

### android release

```sh
[bundle exec] fastlane android release
```

Full release: metadata + screenshots + AAB to production

----


## iOS

### ios metadata

```sh
[bundle exec] fastlane ios metadata
```

Push metadata to App Store Connect

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Upload screenshots to App Store Connect

### ios deploy

```sh
[bundle exec] fastlane ios deploy
```

Upload IPA to App Store Connect

### ios release

```sh
[bundle exec] fastlane ios release
```

Full release: metadata + screenshots + IPA

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
