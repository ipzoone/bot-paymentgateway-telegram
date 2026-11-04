export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
    this.userMessage = message;
  }
}
