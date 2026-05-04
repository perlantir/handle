import { z } from "zod";
import {
  readSharedMemoryKey,
  writeSharedMemoryKey,
} from "../memory/sharedMemory";
import type { ToolDefinition } from "./toolRegistry";

const readInput = z.object({
  key: z.string().min(1).describe("Shared memory key to read."),
});

const writeInput = z.object({
  expectedVersion: z.number().int().nonnegative().nullable().optional(),
  key: z.string().min(1).describe("Shared memory key to write."),
  value: z.unknown().describe("JSON-serializable value to write."),
});

function unavailableMessage() {
  return "Shared memory namespace is not available for this run.";
}

export function createSharedMemoryToolDefinitions(): ToolDefinition[] {
  return [
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Read a value from this run's shared memory namespace. Phase 5 exposes this primitive for future sub-agent coordination.",
      inputSchema: readInput,
      name: "shared_memory_read",
      requiresApproval: false,
      sideEffectClass: "read",
      async implementation(input, context) {
        const parsed = readInput.parse(input);
        if (!context.sharedMemoryNamespaceId) return unavailableMessage();
        const entry = await readSharedMemoryKey({
          key: parsed.key,
          namespaceId: context.sharedMemoryNamespaceId,
        });
        return entry ? JSON.stringify(entry) : `No shared memory value for "${parsed.key}".`;
      },
    },
    {
      backendSupport: { e2b: true, local: true },
      description:
        "Write a value to this run's shared memory namespace using optimistic version checks when available.",
      inputSchema: writeInput,
      name: "shared_memory_write",
      requiresApproval: false,
      sideEffectClass: "write",
      async implementation(input, context) {
        const parsed = writeInput.parse(input);
        if (!context.sharedMemoryNamespaceId) return unavailableMessage();
        const entry = await writeSharedMemoryKey({
          ...(parsed.expectedVersion === null || parsed.expectedVersion === undefined
            ? {}
            : { expectedVersion: parsed.expectedVersion }),
          key: parsed.key,
          namespaceId: context.sharedMemoryNamespaceId,
          value: parsed.value,
          writer: context.taskId,
        });
        return `Wrote shared memory "${parsed.key}" at version ${entry.version}.`;
      },
    },
  ];
}
