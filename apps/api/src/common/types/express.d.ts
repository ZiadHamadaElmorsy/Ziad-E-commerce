// Augment Express.Request with the correlation ID assigned by
// RequestContextMiddleware. Guards, filters and services may read
// `req.requestId` without casts.
declare namespace Express {
  interface Request {
    requestId: string;
  }
}
