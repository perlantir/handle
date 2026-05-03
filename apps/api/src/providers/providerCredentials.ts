import { logger } from "../lib/logger";
import type { ProviderId } from "./types";

export interface ProviderKeychainLike {
  getCredential(account: string): Promise<string>;
}

export interface ProviderConfigEnablementRow {
  enabled: boolean;
  id: string;
}

export function accountForProvider(id: ProviderId) {
  return `${id}:apiKey`;
}

export async function hasProviderApiKey(
  providerId: ProviderId,
  keychain: ProviderKeychainLike,
) {
  const value = await keychain
    .getCredential(accountForProvider(providerId))
    .catch(() => "");

  return value.length > 0;
}

export async function keyedProvidersForFreshInstall<
  Row extends ProviderConfigEnablementRow,
>(rows: Row[], keychain: ProviderKeychainLike) {
  if (rows.some((row) => row.enabled)) return new Set<string>();

  const keyedProviderIds = new Set<string>();
  for (const row of rows) {
    if (
      (row.id === "openai" ||
        row.id === "anthropic" ||
        row.id === "kimi" ||
        row.id === "openrouter") &&
      (await hasProviderApiKey(row.id, keychain))
    ) {
      keyedProviderIds.add(row.id);
    }
  }

  if (keyedProviderIds.size > 0) {
    logger.info(
      { providerIds: Array.from(keyedProviderIds) },
      "Bootstrapping keyed providers after fresh settings reset",
    );
  }

  return keyedProviderIds;
}
