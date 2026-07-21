# Clarissimi CLI

Clarissimi turns reviewed contribution records into auditable contributor recognition outputs.
The CLI works locally and does not require the GitHub Action runtime.

## Install

The standalone package is available from [npm](https://www.npmjs.com/package/clarissimi). Install
the latest verified release with Node.js 24 or newer:

```console
npm install --global clarissimi
clarissimi --help
```

For GitHub-native automation or source-checkout development, see the
[main project README](https://github.com/0disoft/clarissimi#readme).

## Safety boundary

Clarissimi keeps approved contribution records in repository-owned files. Live GitHub collection
and provider-backed draft generation require explicit configuration and credentials. Run
`clarissimi --help` for commands and flags; never place provider tokens in committed config files.

## License

Apache-2.0
