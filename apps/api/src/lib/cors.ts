import type { CorsOptions } from 'cors';

export const corsOrigins = ['http://127.0.0.1:3000'] as const;
export const corsMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const;
export const corsAllowedHeaders = ['Authorization', 'Content-Type'] as const;

export const corsOptions: CorsOptions = {
  allowedHeaders: [...corsAllowedHeaders],
  credentials: true,
  methods: [...corsMethods],
  origin: [...corsOrigins],
};
