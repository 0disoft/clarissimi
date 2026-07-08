#!/usr/bin/env node
import { runActionFromEnvironment } from "../index.js";

const exitCode = await runActionFromEnvironment(process.env, {
  stdout: (value) => {
    process.stdout.write(value);
  },
  stderr: (value) => {
    process.stderr.write(value);
  }
});

process.exitCode = exitCode;
