import type { IntegrationConnectorId } from "@handle/shared";
import {
  getCredential as defaultGetCredential,
  setCredential as defaultSetCredential,
  deleteCredential as defaultDeleteCredential,
} from "../lib/keychain";
import { prisma } from "../lib/prisma";
import {
  createNangoService,
  type IntegrationRequestInput,
  type IntegrationRequestMethod,
} from "./nango/nangoService";

export interface IntegrationProviderRequest {
  accountAlias?: string;
  connectorId: IntegrationConnectorId;
  data?: unknown;
  endpoint: string;
  method?: IntegrationRequestMethod;
  params?: Record<string, unknown>;
  userId: string;
}

export interface IntegrationProviderResponse {
  accountAlias: string;
  connectorId: IntegrationConnectorId;
  data: unknown;
  endpoint: string;
  method: IntegrationRequestMethod;
}

export interface IntegrationToolRuntime {
  request(input: IntegrationProviderRequest): Promise<IntegrationProviderResponse>;
}

export function createDefaultIntegrationToolRuntime(): IntegrationToolRuntime {
  const service = createNangoService({
    keychain: {
      deleteCredential: defaultDeleteCredential,
      getCredential: defaultGetCredential,
      setCredential: defaultSetCredential,
    },
    prisma,
  });

  return {
    async request(input: IntegrationProviderRequest) {
      return service.requestIntegration(input as IntegrationRequestInput);
    },
  };
}
