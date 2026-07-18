# Clarissimi CLI

Clarissimi turns reviewed contribution records into auditable contributor recognition outputs.
The CLI works locally and does not require the GitHub Action runtime.

## Install

The standalone npm package is not published yet. After the first verified publication, install it
with Node.js 24 or newer:

```console
npm install --global clarissimi
clarissimi --help
```

Until then, use the repository checkout or the published GitHub Action documented in the
[main project README](https://github.com/0disoft/clarissimi#readme).

## Safety boundary

Clarissimi keeps approved contribution records in repository-owned files. Live GitHub collection
and provider-backed draft generation require explicit configuration and credentials. Run
`clarissimi --help` for commands and flags; never place provider tokens in committed config files.

## License

Apache-2.0
