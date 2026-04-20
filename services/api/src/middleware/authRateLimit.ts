import { rateLimit } from "express-rate-limit";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const loginRateLimit = rateLimit({
  windowMs: FIVE_MINUTES_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again later.",
  },
});
