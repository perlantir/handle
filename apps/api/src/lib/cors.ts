import type { CorsOptions } from 'cors';

const defaultCorsOrigins = ['http://127.0.0.1:3000'] as const;

function extraCorsOrigins() {
  return (process.env.HANDLE_EXTRA_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const corsOrigins = Array.from(
  new Set([...defaultCorsOrigins, ...extraCorsOrigins()]),
);
export const corsMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const;
export const corsAllowedHeaders = ['Authorization', 'Content-Type'] as const;

export const corsOptions: CorsOptions = {
  allowedHeaders: [...corsAllowedHeaders],
  credentials: true,
  methods: [...corsMethods],
  origin: [...corsOrigins],
};
