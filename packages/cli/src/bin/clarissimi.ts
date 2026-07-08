#!/usr/bin/env node
import { runCli } from "../run.js";

const exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (value) => {
    process.stdout.write(value);
  },
  stderr: (value) => {
    process.stderr.write(value);
  }
});

process.exitCode = exitCode;
