#!/usr/bin/env node
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });

const { synthesizeTrajectoryTemplates } = await import("../../apps/api/src/memory/proceduralMemory.ts");

const result = await synthesizeTrajectoryTemplates();
console.log(`[memory:synthesize-templates] created ${result.created} templates`);
