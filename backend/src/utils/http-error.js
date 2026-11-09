export class HttpError extends Error {
  constructor(statusCode, publicMessage) {
    super(publicMessage);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}
