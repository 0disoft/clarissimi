export const CLI_EXIT_CODES = {
  success: 0,
  usage: 1,
  invalidConfig: 2,
  invalidLedger: 3,
  providerFailure: 4,
  schemaValidationFailure: 5,
  policyRejection: 6,
  writeFailure: 7,
} as const;

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];
