# Publishing to npm with GitHub Actions

The repository is configured to publish public releases from
`.github/workflows/release.yml` when a `v*` tag is pushed. It uses npm Trusted
Publishing (OIDC), so no long-lived `NPM_TOKEN` secret is stored in GitHub.

## One-time setup

Because `linux-sysdoctor` has not been published yet, publish the initial
version from a maintainer machine to create the npm package:

```sh
git checkout main
git pull
npm login
npm whoami
npm publish --access public
```

The `prepublishOnly` script runs the typecheck, tests, and build before
publishing. Confirm that the npm account is allowed to publish the unscoped
name `linux-sysdoctor`; npm will reject the publish if the name is already
owned by another account.

After the initial publish, open the package's **Settings → Trusted Publisher**
on npmjs.com and add a **GitHub Actions** publisher with:

| Setting | Value |
| --- | --- |
| Organization or user | `arien-dev` |
| Repository | `sysdoctor` |
| Workflow filename | `release.yml` |
| Environment | Leave empty (this workflow does not use a GitHub environment) |
| Allowed action | Enable direct `npm publish` |

The release workflow also requires GitHub Actions' `id-token: write`
permission, runs on GitHub-hosted Node.js 24 runners, and installs npm 11
because npm Trusted Publishing requires npm CLI 11.5.1 or later. The workflow
checks that the pushed tag exactly matches the package version.

## Publish a release

Make sure the version in `package.json` is the intended release version, then
create and push a matching tag from `main`. For example, to prepare version
`1.0.1`:

```sh
git checkout main
git pull
npm version patch
git push origin main --follow-tags
```

`npm version patch` updates `package.json` and `package-lock.json`, creates the
`v1.0.1` tag, and commits the version bump. Pushing the branch and tag starts
the release workflow. Watch **Actions → Release** in GitHub; on success, verify
the published version with:

```sh
npm view linux-sysdoctor version
```

If publishing fails with `ENEEDAUTH`, check the npm Trusted Publisher fields,
especially the exact `release.yml` filename and the `arien-dev/sysdoctor`
repository. Do not add an npm token as a workaround; the workflow is designed
to authenticate with OIDC.
