# Changelog

## [0.32.1](https://github.com/askui/askui/compare/v0.32.0...v0.32.1) (2026-05-11)

## [0.32.0](https://github.com/askui/askui/compare/v0.31.0...v0.32.0) (2026-04-10)


### Features

* add SBOM generation and release workflow ([c097334](https://github.com/askui/askui/commit/c097334a9232d1ac645d243192689b4aaa4dbc16))


### Bug Fixes

* **http-client:** enable got retry for transient server errors on POST requests (#SOLENG-333) ([0b13b3a](https://github.com/askui/askui/commit/0b13b3afb3212315028ba83b18bda7804387d9bd)), closes [#SOLENG-333](https://github.com/askui/askui/issues/SOLENG-333)
* **http-client:** wrap unexpected errors in UnkownHttpClientError (#SOLENG-333) ([365be54](https://github.com/askui/askui/commit/365be54bc890cd5a7c252197f7b841f0536cebe0)), closes [#SOLENG-333](https://github.com/askui/askui/issues/SOLENG-333)

## [0.31.0](https://github.com/askui/askui/compare/v0.30.0...v0.31.0) (2025-12-12)


### Features

* **Inference API Cache**: Add inference API cache for improved performance. The cache stores successful control commands to reduce redundant API calls and speed up test execution. Cache entries are stored on disk and can be configured with validation types. Only successful commands (code OK) are cached, and Expect commands are automatically skipped from caching.

  To enable caching, configure it when initializing the UiControlClient:
  ```typescript
  import { UiControlClient } from 'askui';

  const aui = await UiControlClient.build({
    cacheConfig: {
      cacheFilePath: './askui-cache.json',
      validationType: 'PixelPerfect'
    }
  });
  ```

  You can also skip caching for specific commands using the `skipCache` option:
  ```typescript
  await aui.exec().click().button().withText('Submit').exec({ skipCache: true });
  ```

* **Configurable Retry Strategy**: Add configurable retry strategy per execution. You can now customize retry behavior for individual commands or set a default retry strategy for all commands. Available retry strategies include:
  - `ExponentialRetryStrategy`: Exponential backoff (default: baseDelayMs=1000, retryCount=3)
  - `LinearRetryStrategy`: Linear backoff (default: baseDelayMs=1000, retryCount=3)
  - `FixedRetryStrategy`: Constant delay between retries (default: baseDelayMs=1000, retryCount=3)
  - `NoRetryStrategy`: No retries

  Example usage:
  ```typescript
  import { UiControlClient, ExponentialRetryStrategy } from 'askui';

  const aui = await UiControlClient.build({
    retryStrategy: new ExponentialRetryStrategy(2000, 5) // 2s base delay, 5 retries
  });

  // Or override for a specific command:
  await aui.exec().click().button().withText('Submit').exec({
    retryStrategy: new FixedRetryStrategy(500, 10)
  });
  ```

### Bug Fixes

* refactor(waituntil): Fix waituntil function.


## [0.30.0](https://github.com/askui/askui/compare/v0.29.0...v0.30.0) (2025-11-20)


### Features

* add Android swipe, drag-and-drop, and tap tools ([3b99081](https://github.com/askui/askui/commit/3b9908188c4f411576d45de5e8e5cf205587f104))

## [0.29.0](https://github.com/askui/askui/compare/v0.28.2...v0.29.0) (2025-10-17)


### ⚠ BREAKING CHANGES

* **@askui/jest-allure-circus:** Migrate the TestEnvironment from `@askui/jest-allure-circus` to `allure-jest/node` in jest.config.ts

Install allure-jest@3.3.0 and allure-js-commons@3.3.0 environment:

npm install --save-dev allure-jest@3.3.0 allure-js-commons@3.3.0 @askui/askui-reporters
npm uninstall @askui/jest-allure-circus

```typescript
import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["./helper/askui-helper.ts"], // former `./helper/jest.setup.ts`
  sandboxInjectedGlobals: ["Math"],
  testEnvironment: "allure-jest/node",
};

// eslint-disable-next-line import/no-default-export
export default config;
```

### Features

* **@askui/jest-allure-circus:** replace @askui/jest-allure-circus with allure-jest/node ([65b8ea7](https://github.com/askui/askui/commit/65b8ea75eacf0bf8a0dab3eca6883d12d1b9e654))

## [0.28.1](https://github.com/askui/askui/compare/v0.28.0...v0.28.1) (2025-09-08)


### Bug Fixes

* include waitTime during retries ([15558f3](https://github.com/askui/askui/commit/15558f3da1e45327a79c427e460b7fd60599320b))

## [0.28.0](https://github.com/askui/askui/compare/v0.27.0...v0.28.0) (2025-08-13)


### Features

* add utility function to obtain controller server startup arguments ([3a0ce34](https://github.com/askui/askui/commit/3a0ce341a24a98ef1142e8c9b309200e49380430))

## [0.27.0](https://github.com/askui/askui/compare/v0.26.0...v0.27.0) (2025-07-07)


### Features

* add AiElement Tool to the act agent ([0a2b3de](https://github.com/askui/askui/commit/0a2b3de8ee4c56f4e7bb944ebd8a52712a715935))
* add print tool to agent toolset ([7bdea66](https://github.com/askui/askui/commit/7bdea66f0c2e232253e71fe9fc33b611253e2544))
* add support for holding down and releasing keyboard keys ([d35a46b](https://github.com/askui/askui/commit/d35a46b357dee24ab82b68ba1690f0d2b55dc000))


### Bug Fixes

* fix example project creation by pinning specific dependency versions ([850b454](https://github.com/askui/askui/commit/850b4547bdf06b0174c9ceffeae98fbda5dbb25b))

## [0.26.0](https://github.com/askui/askui/compare/v0.25.1...v0.26.0) (2025-06-10)


### Features

* add key press and release to agent ([1b7fc29](https://github.com/askui/askui/commit/1b7fc2928203ed058c0b598f3eabf1a3e36f96dd))
* add support for press-and-hold actions and image-based goals ([2d5ed18](https://github.com/askui/askui/commit/2d5ed184a8cbee81bcd2391c772d794b66b70a6a))


### Bug Fixes

* scaling issues in askui agent ([aef5632](https://github.com/askui/askui/commit/aef56321e79bce99c558a59984ebc87a2ffa03d9))

## [0.25.1](https://github.com/askui/askui/compare/v0.25.0...v0.25.1) (2025-05-28)

## [0.25.0](https://github.com/askui/askui/compare/v0.24.1...v0.25.0) (2025-05-28)


### Features

* add act command ([e8c0bb7](https://github.com/askui/askui/commit/e8c0bb73c534e6031c1e6cbf4a860860add9c4db))

## [0.24.1](https://github.com/askui/askui/compare/v0.24.0...v0.24.1) (2025-05-20)

### Vulnerability Fixes
*  update cross-spawn dependency for vulneability fixes ([b67526e](https://github.com/askui/askui/commit/b67526e7a660d9f8341a3301ff8232d12d50a729))


## [0.24.0](https://github.com/askui/askui/compare/v0.23.1...v0.24.0) (2025-04-17)


### Features

* disable retry strategy for waitUntil command ([46f3f7b](https://github.com/askui/askui/commit/46f3f7be5bc29cf21f49243b005142c86fe448e5))

## [0.23.1](https://github.com/askui/askui/compare/v0.23.0...v0.23.1) (2025-03-10)

## [0.23.0](https://github.com/askui/askui/compare/v0.22.0...v0.23.0) (2025-03-10)


### Bug Fixes

* update inference client API version to v1, previous version is deprecated (#CL-1208) ([#853](https://github.com/askui/askui/issues/853)) ([8efe092](https://github.com/askui/askui/commit/8efe09292b0d2533d115bbcd864d3cf04d56ffbe)), closes [#CL-1208](https://github.com/askui/askui/issues/CL-1208)

* fix logo svg url typo in README ([#852](https://github.com/askui/askui/pull/852))
* refactor: remove table and matching commands (#CL-1174) ([#849](https://github.com/askui/askui/pull/849))

## [0.22.0](https://github.com/askui/askui/compare/v0.21.1...v0.22.0) (2025-02-21)


### Features

* make AIElement source Location Configurable (#CL-1242) ([2e0dd0f](https://github.com/askui/askui/commit/2e0dd0f28fbdd4ab1b7eefdb4b2eb18e977ac094)), closes [#CL-1242](https://github.com/askui/askui/issues/CL-1242)


### Bug Fixes

* clear dangling timeout ref ([#839](https://github.com/askui/askui/issues/839)) ([12de0f2](https://github.com/askui/askui/commit/12de0f27335b03fb02d070a244bfaff2dc244a44))

## [0.21.1](https://github.com/askui/askui/compare/v0.21.0...v0.21.1) (2024-12-9)
### Bug Fixes
* add debug logging for sending and receiving to detect race conditions (https://github.com/askui/askui/pull/837)

## [0.20.10](https://github.com/askui/askui/compare/v0.20.9...v0.20.10) (2024-10-17)


### Bug Fixes

* escape text strings in askui code in annotation ([230ef94](https://github.com/askui/askui/commit/230ef9435f792546000c6874ef2073678047fb95))

## [0.20.8](https://github.com/askui/askui/compare/v0.20.7...v0.20.8) (2024-09-18)


### Features

* add ask command (#CL-897) ([5a1b881](https://github.com/askui/askui/commit/5a1b8819dd4f1893338c4da46108149d84a2faac)), closes [#CL-897](https://github.com/askui/askui/issues/CL-897)

## [0.20.7](https://github.com/askui/askui/compare/v0.20.6...v0.20.7) (2024-08-05)


### Features

* adapt init command to the new installer: No credentials and AskUI Controller setup (#APD-86) ([ce7d660](https://github.com/askui/askui/commit/ce7d660450683c3ea6907ca131057369dfcf4a26)), closes [#APD-86](https://github.com/askui/askui/issues/APD-86)
* add deprecation flag to UiController class (#APD-86) ([dbe577e](https://github.com/askui/askui/commit/dbe577e14cd918e69c8c4bc62b14ce70f79ef0b3)), closes [#APD-86](https://github.com/askui/askui/issues/APD-86)

## [0.20.6](https://github.com/askui/askui/compare/v0.20.5...v0.20.6) (2024-08-01)

### Bug Fixes

* rename .gitignore to gitignore to avoid not getting published by npm publish ([1b08a81](https://github.com/askui/askui/commit/1b08a8140b0e0f4463c7b95951f45f73b1861ff4))

## [0.20.5](https://github.com/askui/askui/compare/v0.20.4...v0.20.5) (2024-08-01)

### Features

* add .gitignore; Error log show line of error and code now (#DVRL-81) ([46f4967](https://github.com/askui/askui/commit/46f49673b73404fcbeca469e3ad442cff5e3e440))

## [0.20.4](https://github.com/askui/askui/compare/v0.20.3...v0.20.4) (2024-07-30)

## [0.20.3](https://github.com/askui/askui/compare/v0.20.2...v0.20.3) (2024-07-10)

* Extended docs and changed default threshold of custom element from 0.9 to 0.5 to be able to find element without having to touch treshold but at the cost of finding the wrong element from time to time where no element was found before

## [0.20.2](https://github.com/askui/askui/compare/v0.20.0...v0.20.2) (2024-06-27)


### Features

* **dsl:** introduce intersecting option for neighbour relations (#CL-748) ([d0d5244](https://github.com/askui/askui/commit/d0d524464307f9a39c80299d0ede47b66130c598)), closes [#CL-748](https://github.com/askui/askui/issues/CL-748)

## [0.18.1](https://github.com/askui/askui/compare/v0.18.0...v0.18.1) (2024-06-13)


### Features

* **askui-nodejs:** add new custom element options (#CL-731) ([2e9d294](https://github.com/askui/askui/commit/2e9d294fd9182a97465cf32d080f348a5a121af4)), closes [#CL-731](https://github.com/askui/askui/issues/CL-731)
* **ML-492:** use default api version as v4 ([7898fb7](https://github.com/askui/askui/commit/7898fb7758d8b94f76e757163b200df4cc5c31db))
* **ML-492:** use V4 online learning endpoint. ([d6c2923](https://github.com/askui/askui/commit/d6c2923f143a7642de6c601a446327bff92dbdea))


### Bug Fixes

* **askui-nodejs:** fix retry of http requests, e.g., don't retry on user mistakes (#CL-736) ([73781eb](https://github.com/askui/askui/commit/73781eb46facd2af1519150627b9ca77c3ced215)), closes [#CL-736](https://github.com/askui/askui/issues/CL-736)
* **askui-nodejs:** log (not throw) error if reporter is misused to reveal underlying error (#CL-736) ([1c8de05](https://github.com/askui/askui/commit/1c8de05f0bd6495b32e3a8c3f8044a53b0a36681)), closes [#CL-736](https://github.com/askui/askui/issues/CL-736)
* **ML-492:** change url to experimental ([e8e40e0](https://github.com/askui/askui/commit/e8e40e078cd034fafd9bae7dce5432386f1bf8e7))
* **ML-492:** fix url to consistent ([e3915d8](https://github.com/askui/askui/commit/e3915d8e4ac41ef63ad3f7e573745f3fe5af1b6d))
* **ML-492:** fix v4 isImageRequired logic ([ee47c11](https://github.com/askui/askui/commit/ee47c1100577fc22c58e6584e3df26a3947d5cc9))
* **ML-492:** linting fix for alphabetical ([46e7055](https://github.com/askui/askui/commit/46e7055bed7210edcd7adf9215a6333dd179786e))
* **ML-492:** linting fix for alphabetical ([0f2c7e0](https://github.com/askui/askui/commit/0f2c7e018e9c2d4b160368f1a1e478592d33fa6d))
* **ML-492:** linting fixes ([223cf94](https://github.com/askui/askui/commit/223cf940ecb9452248990ca26cce6f178cd17aaf))


## [0.17.1](https://github.com/askui/askui/compare/v0.17.0...v0.17.1) (2024-04-15)


* chore: track if running in ci (#CL-682) by @adi-wan-askui in https://github.com/askui/askui/pull/740


## [0.17.0](https://github.com/askui/askui/compare/v0.16.0...v0.17.0) (2024-03-22)


### Features
* add -ad --automations-description option so users can specify a name for the askui project ([556c977](https://github.com/askui/askui/commit/556c97724c6ac77d1898b4270fc3ac48b38dae81))
* add new convenience method clickTextfieldNearestTo(label) ([8c25ea0](https://github.com/askui/askui/commit/8c25ea0b7154d7ec5e354cc021785a149ce53eb9))

## [0.16.0](https://github.com/askui/askui/compare/v0.15.0...v0.16.0) (2024-03-05)


### Bug Fixes

* sync package-lock.json with package.json ([0113163](https://github.com/askui/askui/commit/011316315afacf1cfa18c4f5586b5ec0c1ca8af9))


## [0.15.0](https://github.com/askui/askui/compare/v0.14.0...v0.15.0) (2024-03-05)


### Bug Fixes

* add npm init for Linux; Remove Jasmine template (#APD-392) ([d8379f0](https://github.com/askui/askui/commit/d8379f098bd4827d7257aba279d6d125f45099f3)), closes [#APD-392](https://github.com/askui/askui/issues/APD-392)
* askUI Controller URL; Spelling error docs; Correct end instructions for windows (#APD-392) ([57ac5e5](https://github.com/askui/askui/commit/57ac5e52b5cc7820630f885ba85883fe2f88fea5)), closes [#APD-392](https://github.com/askui/askui/issues/APD-392)
* fix broken links in Release Notes 03-04-2024 ([5992c75](https://github.com/askui/askui/commit/5992c7535dce384e315a36530627a97838d355cf))
* remove test script from package json after npm init -y (#APD-392) ([eaba244](https://github.com/askui/askui/commit/eaba24460faaff12540b47d27215171c4196ad88)), closes [#APD-392](https://github.com/askui/askui/issues/APD-392)
* remove unfixable dragTo convenience method ([db17391](https://github.com/askui/askui/commit/db17391824993d6ca302918f1fb5f13b157874af))


### Reverts

* readd --test-framework option for interactive CLI for backwards compatibility (#DVRL-72) ([3e5e4e9](https://github.com/askui/askui/commit/3e5e4e97dc3829bcdc6923667bb227bd3f540c92)), closes [#DVRL-72](https://github.com/askui/askui/issues/DVRL-72)

## [0.14.0](https://github.com/askui/askui/compare/v0.13.1...v0.14.0) (2024-02-22)


### Features

* add a set of convenience methods to UiControlClient ([509d255](https://github.com/askui/askui/commit/509d255b65a8ea757ddb225f4fa9337002c62722))
* add clickTexts(texts: string[]) convenience function to UiControlClient ([0fe90f6](https://github.com/askui/askui/commit/0fe90f6027cd8eb54e2d699129c94990c9262df1))


### Bug Fixes

* fix typo in interactive CLI: credentails -> credentials (#DVRL-67) ([22ce43a](https://github.com/askui/askui/commit/22ce43a2ec538ae96ee7dd44c1472d51771c41d1)), closes [#DVRL-67](https://github.com/askui/askui/issues/DVRL-67)
* **proxy:** support ipv6 autoselect dns lookup (#GROUP-25816) ([9b67ae6](https://github.com/askui/askui/commit/9b67ae6913d650262385de345d287d9ce5ff6d97)), closes [#GROUP-25816](https://github.com/askui/askui/issues/GROUP-25816) [/github.com/nodejs/node/issues/48771#issuecomment-1661707763](https://github.com/askui//github.com/nodejs/node/issues/48771/issues/issuecomment-1661707763)
* remove unused scss ([9c4da26](https://github.com/askui/askui/commit/9c4da26db92f92b040da99ab612af39a3aef7d96))
* try to fix broken docu-deployment workflow ([f752956](https://github.com/askui/askui/commit/f752956b0aacce61a3dc7b698a3133fe4a123fbe))

## [0.13.1](https://github.com/askui/askui/compare/v0.13.0...v0.13.1) (2023-11-06)


### Bug Fixes

* Check if folder for helper files exists when running askui init command ([7799763](https://github.com/askui/askui/commit/779976331591eae6aba301ca843294f6e2e5376a))

## [0.13.0](https://github.com/askui/askui/compare/v0.12.2...v0.13.0) (2023-11-06)


### Features

* final version of the interactive CLI; Using templating engine nunjuks; Docs adapted ([400b728](https://github.com/askui/askui/commit/400b728e76762131f086ddc67f78ca03252bb16e))

### Bug Fixes

* add missing await when using Reporter.attachVideo() in example template project ([d7c6c7d](https://github.com/askui/askui/commit/d7c6c7dd843ba235e48dff08c5a3cd14e1fea6de))
* ignore example_projects_templates for linting ([81a41ff](https://github.com/askui/askui/commit/81a41ffe304487c14bc496cc780285739245645f))
* take another shot at proper feedback tracking for the docs-pages, pagename is missing in event ([58b3822](https://github.com/askui/askui/commit/58b3822476b8085fa518e61c5e7c25ac356cd417))

### [0.12.2](https://github.com/askui/askui/compare/v0.12.1...v0.12.2) (2023-10-06)

## [0.12.1](https://github.com/askui/askui/compare/v0.12.0...v0.12.1) (2023-09-27)


* docs: delete a lot of versions; Add warning not to configure multiple reporter simultaneously by @JohannesDienst-askui in https://github.com/askui/askui/pull/560
* feat(packages/askui-nodejs): allow passing multiple reporters to ui control client (#CL-457) by @adi-wan-askui in https://github.com/askui/askui/pull/562

## [0.12.0](https://github.com/askui/askui/compare/v0.11.6...v0.12.0) (2023-09-12)


### Features

* add similarityScore to withText filter (#CO-444) ([0957dba](https://github.com/askui/askui/commit/0957dba46ce17ddcf9444dc773e9d4ae60b471be)), closes [#CO-444](https://github.com/askui/askui/issues/CO-444)

## [0.11.6](https://github.com/askui/askui/compare/v0.11.5...v0.11.6) (2023-09-11)


### Bug Fixes

* fix allure-reporting by using fixed fork of @askui/jest-allure-circus ([9e82d12](https://github.com/askui/askui/commit/9e82d127c0cd68cf838da9c82c3c7b4825074852))

## [0.11.5](https://github.com/askui/askui/compare/v0.11.3...v0.11.5) (2023-09-05)


### Features

* add detectedElements as optional input to the annoation command (#CO-416) ([fce3608](https://github.com/askui/askui/commit/fce3608a1fbc5d06d1af486e84fa1ed8575eb971)), closes [#CO-416](https://github.com/askui/askui/issues/CO-416)


### Bug Fixes

* **askui-nodejs:** allow to diff between failure and other errors in jest ([cd3d558](https://github.com/askui/askui/commit/cd3d558819cab0009b437cd1844f105be3e18d46))
* **askui-nodejs:** handle errors in reporter silently ([72c6cee](https://github.com/askui/askui/commit/72c6cee241ce3638030293f9f92163400f166b58))
* fix broken links ([be02cb3](https://github.com/askui/askui/commit/be02cb3bc1b93e247001a9e2abdd669e74e3d174))

## [0.11.4](https://github.com/askui/askui/compare/v0.11.3...v0.11.4) (2023-09-05)


### Features

* add detectedElements as optional input to the annoation command (#CO-416) ([fce3608](https://github.com/askui/askui/commit/fce3608a1fbc5d06d1af486e84fa1ed8575eb971)), closes [#CO-416](https://github.com/askui/askui/issues/CO-416)


### Bug Fixes

* **askui-nodejs:** allow to diff between failure and other errors in jest ([cd3d558](https://github.com/askui/askui/commit/cd3d558819cab0009b437cd1844f105be3e18d46))
* fix broken links ([be02cb3](https://github.com/askui/askui/commit/be02cb3bc1b93e247001a9e2abdd669e74e3d174))

## [0.11.3](https://github.com/askui/askui/compare/v0.11.2...v0.11.3) (2023-07-31)


### Bug Fixes

* fix user identifier (#CO-411) ([f31a2a0](https://github.com/askui/askui/commit/f31a2a0dc80bc456ac50a3b863c44866122fd6d0)), closes [#CO-411](https://github.com/askui/askui/issues/CO-411)

## [0.11.2](https://github.com/askui/askui/compare/v0.11.1...v0.11.2) (2023-07-26)


### Bug Fixes

* example template for npx askui init uses correct function attachVideo from AllureReporter ([47aaa74](https://github.com/askui/askui/commit/47aaa74719875facae162d592c767572e4a68974))

## [0.11.1](https://github.com/askui/askui/compare/v0.11.0...v0.11.1) (2023-07-26)


### Features

* adapt to released package for askui-reporters (#CL-327) ([977d5ef](https://github.com/askui/askui/commit/977d5ef1ec00860230cefd5733ac9814489a4e64)), closes [#CL-327](https://github.com/askui/askui/issues/CL-327)
* use askui-reporters inside template project; Also add docs for it (#CL-327) ([02a8d72](https://github.com/askui/askui/commit/02a8d72d83935e510a887143175e2d25443baaec)), closes [#CL-327](https://github.com/askui/askui/issues/CL-327)

## [0.11.0](https://github.com/askui/askui/compare/v0.10.5...v0.11.0) (2023-07-06)


### ⚠ BREAKING CHANGES

* **packages/askui-nodejs:** Deprecate creating annotation file after instruction including configuration via
UiControlClient's ClientArgs.annotationLevel. Use reporter instead.

### Features

* **packages/askui-nodejs:** deprecate creating annotation file after instruc. (incl. config) ([029c04a](https://github.com/askui/askui/commit/029c04a94855c76462cb6226012676743afd04b2))


### Bug Fixes

* **askui-nodejs/error-handling:** use UiControllerClientError correctly (#CL-322) ([3c08093](https://github.com/askui/askui/commit/3c08093f9c51e1a89d8aed09a04231887a803302))
* **askui-nodejs/reporting:** differentiate correctly between failed and erroneous instructions ([2b3732e](https://github.com/askui/askui/commit/2b3732e6cc04938885d10fed7c4c9c402f7f1a21))
* **packages/askui-nodejs:** fix auto-completion for reporter in UiControlClient's ClientArgs ([c55b4e6](https://github.com/askui/askui/commit/c55b4e6f3f0587de11d2af910a33aecb0bce69bd))

## [0.10.5](https://github.com/askui/askui/compare/v0.10.4...v0.10.5) (2023-06-21)


### Features

* **askui-nodejs:** retry failed requests to inference ([b4aaf2e](https://github.com/askui/askui/commit/b4aaf2e8d4b5ceb50479d966f52cd2c9c98b3a27))

## [0.10.4](https://github.com/askui/askui/compare/v0.10.3...v0.10.4) (2023-06-13)


### Bug Fixes

* **packages/askui-nodejs:** fix that text and index params are optional ([81515ca](https://github.com/askui/askui/commit/81515caee9a47e1bc69024958bf4910c1eca3c29))

## [0.10.3](https://github.com/askui/askui/compare/v0.10.2...v0.10.3) (2023-06-13)

### Features

* update the dsl with the new table filters and optional params (#ML-7) ([58c63d5](https://github.com/askui/askui/commit/58c63d5fb52966afb3477780cc5825ed9ea7d179)), closes [#ML-7](https://github.com/askui/askui/issues/ML-7)

## [0.10.2](https://github.com/askui/askui/compare/v0.10.1...v0.10.2) (2023-06-12)

### ⚠ BREAKING CHANGES

* **packages/askui-nodejs:** - The close method will be removed in the next major release.
- Please update your code to use the disconnect method.

### Features

* add copy to clipboard icon to the annotation ([292dd2d](https://github.com/askui/askui/commit/292dd2d27e20ee18091094aec0f5d63c363797c4))
* **packages/askui-nodejs:** add ability to record video to ui control client api (#CL-186) ([e6dfbcb](https://github.com/askui/askui/commit/e6dfbcb3f59b95848026ab45756b4e6196391e48)), closes [#CL-186](https://github.com/askui/askui/issues/CL-186)
* **packages/askui-nodejs:** add step level reporting (#CL-186) ([9257621](https://github.com/askui/askui/commit/92576211fbfc66ccfbd9a7cb4bfba722be5938bb)), closes [#CL-186](https://github.com/askui/askui/issues/CL-186)
* **packages/askui-nodejs:** deprecate close() in favor of disconnect() (#CL-186) ([7318a7a](https://github.com/askui/askui/commit/7318a7ad5daa9dce890135da3d3dc6941ed17c64)), closes [#CL-186](https://github.com/askui/askui/issues/CL-186)

## [v0.10.1](https://github.com/askui/askui/compare/0.9.0...v0.10.1) (2023-04-26)


### Features

* **dsl:** add element, other element and special selector (#ML-111) ([b8d9fd5](https://github.com/askui/askui/commit/b8d9fd524545b9557433c5219ceb3721c7712061)), closes [#ML-111](https://github.com/askui/askui/issues/ML-111)

## [0.9.0](https://github.com/askui/askui/compare/0.8.0...0.9.0) (2023-04-17)


### Features

* enable model configuration (#CO-277) ([7c3ec81](https://github.com/askui/askui/commit/7c3ec8143c4f3927ea1f3e486f3d51021381c237)), closes [#CO-277](https://github.com/askui/askui/issues/CO-277)

## [0.8.0](https://github.com/askui/askui/compare/0.7.2...0.8.0) (2023-04-01)


### Features

* add current version of dsl ([7c4c689](https://github.com/askui/askui/commit/7c4c68904616ec67c843210c8f8647becc17a459))
* **dsl:** add matching (#AS-1710) ([fc4dca5](https://github.com/askui/askui/commit/fc4dca57cc6da094303f1e24a00a2a95d8c8c4fc)), closes [#AS-1710](https://github.com/askui/askui/issues/AS-1710)
* **dsl:** add reduced class set (#AS-1710) ([5fff093](https://github.com/askui/askui/commit/5fff0939062b2857b686f07a7195c9da098a8a1b)), closes [#AS-1710](https://github.com/askui/askui/issues/AS-1710)
* **match:** rename match to matching (#AS-1710) ([9734087](https://github.com/askui/askui/commit/9734087776b0d5ae69afe0c7c379d1f79f4b31fc)), closes [#AS-1710](https://github.com/askui/askui/issues/AS-1710)


### Bug Fixes

* **ui-control-client:** fix type and typeIn secret text bug ([108323d](https://github.com/askui/askui/commit/108323dfc128efbcca46c90cfe89ccb995925944))

## [0.7.2](https://github.com/askui/askui/compare/0.7.1...0.7.2) (2023-01-30)

* **askui-nodejs:** warn user of usage running out ([b2dd16c](https://github.com/askui/askui/commit/b2dd16cf1108aaf075d72493e9f41ddde66485a4))

## [0.7.1](https://github.com/askui/askui/compare/0.7.0...0.7.1) (2023-01-26)

* change example_projects_template testfile to reflect changes in docs ([84512f5](https://github.com/askui/askui/commit/84512f5684d7bae2ce1cc96a05e877fab56e41dc))
* use temp file to download binaries of askui UI Controller (#AS-1696) ([1caf102](https://github.com/askui/askui/commit/1caf10272bd3c1e9d607ce710fbca2c09eb08fe0)), closes [#AS-1696](https://github.com/askui/askui/issues/AS-1696)
* add mouse commands ([ddf1d41](https://github.com/askui/askui/commit/ddf1d410e96f03518fcb8dd205df7d8440d6aa85))

## [0.7.0](https://github.com/askui/askui/compare/0.6.1...0.7.0) (2023-01-25)

* make colors optional (#AS-1714) ([a0dbeac](https://github.com/askui/askui/commit/a0dbeacd9cfd1b5e918cf283d301800a0f5a04ac)), closes [#AS-1714](https://github.com/askui/askui/issues/AS-1714)

## [0.6.1](https://github.com/askui/askui/compare/0.6.0...0.6.1) (2022-12-19)

* docs: add new android tutorial for web searching automation by @HaramChoi-askui in https://github.com/askui/askui/pull/223
* docs: youTube DSGVO compliance; Relational Selectors gifs; Onboarding… by @JohannesDienst-askui in https://github.com/askui/askui/pull/224
* docs: documentation for jest exit error. resolve spellchecks warning … by @thinh-askui in https://github.com/askui/askui/pull/232

## [0.6.0](https://github.com/askui/askui/compare/0.5.0...0.6.0) (2022-11-30)

* Proxy Implementation - Some Optimization Ideas by @adi-wan-askui in https://github.com/askui/askui/pull/216
* Proxy Implementation by @programminx-askui in https://github.com/askui/askui/pull/201
* docs: add gifs with an example for relational selectors under API by @JohannesDienst-askui in https://github.com/askui/askui/pull/215
* docs: fix missing function in Table of Contents by @HaramChoi-askui in https://github.com/askui/askui/pull/219
* Client side resize flag by @mlikasam-askui in https://github.com/askui/askui/pull/222

## [0.5.0](https://github.com/askui/askui/compare/0.4.0...0.5.0) (2022-11-14)

* add and_ and or_relation (#AS-1444) ([419ccb9](https://github.com/askui/askui/commit/419ccb9bdbb670857ab49478457fb79ee053b071)), closes [#AS-1444](https://github.com/askui/askui/issues/AS-1444)
* ignore Rule import/no-extraneous-dependencies for example_project_template; Minor Refactorings ([60d08b5](https://github.com/askui/askui/commit/60d08b5cb810ed110e6b5a010d0f40f52e87f5dc))
* extend spellchecker dictionary ([90d0563](https://github.com/askui/askui/commit/90d05631c999fa354ff7640bcbf86189e27079a4))

## [0.4.0](https://github.com/askui/askui/compare/0.3.2...0.4.0) (2022-10-26)

* Update selecting_ui_elements.mdx by @gauravkhuraana in https://github.com/askui/askui/pull/116
* Docs updates: Activate Analytics, Redirect to docs from landing page, consistent access Token naming, optimize Getting Started and Troubleshooting, Footer section About by @JohannesDienst-askui in https://github.com/askui/askui/pull/130
* fix: change annotation timestamps to UTC (#AS-1380) by @mlikasam-askui in https://github.com/askui/askui/pull/139
* Docs: Push changes from next to 0.2.7, 0.3.1 and 0.3.2 by @JohannesDienst-askui in https://github.com/askui/askui/pull/142
* docs: fixed wrong file name in writing-your-first-test.md by @JohannesDienst-askui in https://github.com/askui/askui/pull/151
* docs: remove redirect from landing page; Correct GTM number for docs by @JohannesDienst-askui in https://github.com/askui/askui/pull/171
* As 1405 get command frontend by @mlikasam-askui in https://github.com/askui/askui/pull/172
* As 1403 adding infernce endpoint to frontend one object by @mlikasam-askui in https://github.com/askui/askui/pull/176
* feat: logging deprecation warning if header is defined (#AS-1402) by @thinh-askui in https://github.com/askui/askui/pull/178
* As 1403 adding infernce endpoint to frontend by @thinh-askui in https://github.com/askui/askui/pull/160
* Added two new tutorials and corrected some errors in the existing ones by @JohannesDienst-askui in https://github.com/askui/askui/pull/177

## [0.3.2](https://github.com/askui/askui/compare/0.3.1...0.3.2) (2022-09-24)

* chore: add analytics cookie to request by @adi-wan-askui in https://github.com/askui/askui/pull/118

## [0.3.1](https://github.com/askui/askui/compare/0.2.7...0.3.1) (2022-09-23)

* docs: add Local search; Add 'Edit this page' for 0.2.7 and next; Toke… by @JohannesDienst-askui in https://github.com/askui/askui/pull/110
* docs: fix wrong link in Getting Started to askui User Portal signup by @JohannesDienst-askui in https://github.com/askui/askui/pull/112
* As 1379 configurable wait time after each action by @mlikasam-askui in https://github.com/askui/askui/pull/114
* docs: rename nearest to nearestTo by @mlikasam-askui in https://github.com/askui/askui/pull/115

### New Contributors
* @JohannesDienst-askui made their first contribution in https://github.com/askui/askui/pull/110

## [0.2.7](https://github.com/askui/askui/compare/0.2.6...0.2.7) (2022-09-14)

* fix(askui-nodejs): connect to ui controller on mac by @adi-wan-askui in https://github.com/askui/askui/pull/102

## [0.2.6](https://github.com/askui/askui/compare/0.2.5...0.2.6) (2022-09-13)

* As 1137 migrate from tenant to workspace  model by @mlikasam-askui in https://github.com/askui/askui/pull/45

## [0.2.5](https://github.com/askui/askui/compare/0.2.4...0.2.5) (2022-09-01)

* Fix up Getting Started docs by @adi-wan-askui in https://github.com/askui/askui/pull/72

## [0.2.4](https://github.com/askui/askui/compare/0.2.3...0.2.4) (2022-08-24)

## [0.2.3](https://github.com/askui/askui/compare/0.2.2...0.2.3) (2022-08-16)

* **dsl:** add withTextRegex filter by @mlikasam-askui in https://github.com/askui/askui/pull/47
* migrate from tenant to workspace model by @mlikasam-askui in https://github.com/askui/askui/pull/42

## [0.2.2](https://github.com/askui/askui/compare/0.2.1...0.2.2) (2022-07-05)

* docs: fix  testcontainer examples by @mlikasam-askui in https://github.com/askui/askui/pull/40
* fix(askui-nodejs): postinstall hook on windows by @adi-wan-askui in https://github.com/askui/askui/pull/41

## [0.2.1](https://github.com/askui/askui/compare/0.2.0...0.2.1) (2022-07-04)

* AS-920 Type Secrets by @adi-wan-askui in https://github.com/askui/askui/pull/21
* docs: add troubleshooting for macos by @adi-wan-askui in https://github.com/askui/askui/pull/33
* feat(askui-nodejs): allow tracking time to value using install timest… by @adi-wan-askui in https://github.com/askui/askui/pull/35
* fix: creation of timestamp for esm (#AS-1070)  by @adi-wan-askui in https://github.com/askui/askui/pull/39

## [0.2.0](https://github.com/askui/askui/compare/0.1.6...0.2.0) (2022-06-23)

* AS-944 Fix Handling UI Controller Binary Paths Including Whitespace by @adi-wan-askui in https://github.com/askui/askui/pull/9
* AS-1061 fix slow jest by @maxi-askui in https://github.com/askui/askui/pull/12
* refactor: rename scollUntil to scollInside. update docs (#AS-925) by @thinh-askui in https://github.com/askui/askui/pull/11
* docs(configuration options): document all config options for askui-ui… by @thinh-askui in https://github.com/askui/askui/pull/10
* As 1034 rename for source code UI controller 2 by @mlikasam-askui in https://github.com/askui/askui/pull/17
* As 993 unauthenticated library usage with tracking by @mlikasam-askui in https://github.com/askui/askui/pull/15
* AS-1010 Fix waitFor() by @adi-wan-askui in https://github.com/askui/askui/pull/22
* As 1073 improve speed if image resizing in lib by @thinh-askui in https://github.com/askui/askui/pull/20
* As 1007 troubleshooting UI controller wayland problems by @thinh-askui in https://github.com/askui/askui/pull/16
* As 979 documentation of configuration options by @thinh-askui in https://github.com/askui/askui/pull/14

### ⚠ BREAKING CHANGES

* construction of ui-control-client with constructor replaced by builder pattern

## 0.1.6 (2022-06-05)

First Official Release

We migrated from Gitlab to Github and made our package public on [npmjs](https://www.npmjs.com/) starting our open-source journey with you.
