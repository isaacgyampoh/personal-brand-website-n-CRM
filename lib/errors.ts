/** Base class for errors whose message is safe to show to end users. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
