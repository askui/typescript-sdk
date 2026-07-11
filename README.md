![askui logo](./img/askui-logo-white.svg#gh-dark-mode-only)
![askui logo](./img/askui-logo.svg#gh-light-mode-only)

*Reliable, automated end-to-end-automation that only depends on what is shown on your screen instead of the technology or platform you are running on*

<br/>

<center> <h1> What Can Be Said Can Be Solved </h1> </center>


## Disclaimer

This repo contains the AskUI SDK (ADK) written in TypeScript. Releases are done from the root repository. This may change in the future as we plan to include also packages, libraries etc. written in other languages in this repo to make the power of AskUI available to non-typescript/-javascript developers as well.

## Repository Structure

At root level we store the configuration for commit hooks, CI/CD and releasing a new version of the ADK.

Under `packages` you find the ADKs for different languages.

## Installation
Run an `npm install` inside the root directory to install the necessary dependencies for commit hooks and releasing a new version.

```sh
$ npm install
```

### TypeScript ADK
Run `npm install` inside `packages/askui-nodejs` to install the dependencies.

To build the TypeScript ADK run

```sh
npm run build
```

## Releasing

Releases of the TypeScript ADK are done manually with [release-it](https://github.com/release-it/release-it) from `packages/askui-nodejs` (configuration in `packages/askui-nodejs/.release-it.json`). The version increment is derived from the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) since the last release tag. Note that commits marked as breaking changes (`feat!`, `BREAKING CHANGE`) trigger a **major** bump — pass `--increment=minor` explicitly if that is not intended.

### Requirements

- A clean clone of this repository on the `main` branch (or a `*.*.x` maintenance branch)
- Node.js 20 (the version used by CI)
- npm account with publish access to the `askui` package, logged in via `npm login`. If your account enforces 2FA for writes, npm prompts for a one-time password during publish — so run the release interactively, or use a granular access token that bypasses 2FA.
- `GITHUB_TOKEN` environment variable with `repo` scope (e.g. from `gh auth token`) so release-it can create the GitHub release; without it, release-it prints a pre-filled URL to create the release manually
- Push access to `main` (the release commits the version bump and changelog and pushes it together with the release tag)

### Running a release

```sh
cd packages/askui-nodejs
npm ci
npm run release              # or: npm run release:prerelease
```

### On Windows: release from WSL

Do not release from Windows directly — use WSL (e.g. Ubuntu) instead. One-time setup:

1. Install Node 20 inside WSL, e.g. via [nvm](https://github.com/nvm-sh/nvm)
2. Clone the repository into the Linux file system (e.g. `~/askui`), **not** under `/mnt/c/...` — the Windows mount is slow and can cause line-ending issues
3. Set your git identity inside WSL: `git config --global user.name "..."` and `git config --global user.email "..."`
4. To reuse your Windows SSH keys/agent (e.g. 1Password) for pushing, let git in WSL delegate to the Windows SSH client:

   ```sh
   git config --global core.sshCommand /mnt/c/Windows/System32/OpenSSH/ssh.exe
   ```

5. Log in to npm inside WSL: `npm login`

Then release as described above from the WSL clone.

### Troubleshooting

- **`npm error code E404` on publish**: npm masks missing publish permissions as 404. Check that `npm whoami` matches an account listed in `npm owner ls askui` and that no wrongly scoped token shadows your login in `~/.npmrc`.
- **Publish succeeded but a later git step failed** (identity, push, ...): the npm version is already live, so do not run a full release again. Fix the cause, then complete only the git/GitHub half: `npm run release -- --ci --no-npm.publish` (add `--increment=minor` if it was used before).

## Contributing

### Branching

Your branch name should conform to the format `<issue id>-<issue title lower-cased and kebab-cased>`, e.g., let's say you have an issue named *Hello World* with id *AS-101*, the the branch name would be `AS-101-hello-world`. We use the issue id prefix to prepend a link to the issue to the commit message header. In some cases, when doing a quick fix of a typo etc. when there is no issue, feel free to just use a descriptive name of what you are doing, e.g., `fix-typo-in-example-readme`.

### Commit Message Standard

Commit messages should conform to [Conventional Commits Message Standard](https://www.conventionalcommits.org/en/v1.0.0/). Exceptions to this rule may be merge commits.

### Githooks

This monorepo uses [githooks](https://git-scm.com/docs/githooks) with [husky](https://github.com/typicode/husky) to lint and test the code, to help you stick to the commit message standard by opening up a cli for constructing the commit message on each commit, prepending the commit message with the issue number or linting the commit message etc. In some cases, e.g., when using a Git client such as [Git Tower](https://www.git-tower.com/) or [GitKraken](https://www.gitkraken.com/), cherry-picking, rebasing or in a ci pipeline, you may want to disable githooks, especially the interactive cli.

For skipping the interactive cli when commiting, set the environment variable `SKIP_CZ_CLI` to `true`.
```sh
$ export SKIP_CZ_CLI=true
```

For skipping all githooks, set the environment variable `HUSKY` to `0`.
```sh
$ export HUSKY=0
```

In a ci pipeline, the githooks are skipped by default.
