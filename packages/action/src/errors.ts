export class ActionUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionUsageError";
  }
}
