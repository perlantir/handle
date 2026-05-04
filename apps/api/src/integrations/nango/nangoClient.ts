import { Nango } from "@nangohq/node";

export interface NangoClientConfig {
  host: string;
  secretKey: string;
}

export type NangoClient = InstanceType<typeof Nango>;

export type NangoClientFactory = (config: NangoClientConfig) => NangoClient;

export const DEFAULT_NANGO_HOST = "https://api.nango.dev";

export const defaultNangoClientFactory: NangoClientFactory = ({
  host,
  secretKey,
}) => new Nango({ host, secretKey });
