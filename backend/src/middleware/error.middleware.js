export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: 'Route not found.',
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const candidateStatus = Number.isInteger(error.statusCode)
    ? error.statusCode
    : error.status;
  const statusCode = Number.isInteger(candidateStatus)
    && candidateStatus >= 400
    && candidateStatus <= 499
    ? candidateStatus
    : 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500
      ? 'Internal server error'
      : typeof error.publicMessage === 'string'
        ? error.publicMessage
        : 'Request could not be processed',
  });
}
