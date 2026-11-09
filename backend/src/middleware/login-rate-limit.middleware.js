import { rateLimit } from 'express-rate-limit';

// The built-in memory store is intended for development/single-instance use.
// Multi-instance production requires a shared store and narrowly configured Express trust proxy.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later.',
    });
  },
});
