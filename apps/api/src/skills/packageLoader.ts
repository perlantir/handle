import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseSkillManifest } from "./manifestSchema";
import { validateSkillMarkdown } from "./skillMarkdown";
import type { SkillPackage } from "./types";

function packageRoots() {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "packages"),
    resolve(process.cwd(), "apps/api/src/skills/packages"),
  ];
}

export async function loadBuiltinSkillPackages(): Promise<SkillPackage[]> {
  const root = await resolveExistingPackageRoot();
  const entries = await readdir(root, { withFileTypes: true });
  const packages: SkillPackage[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(root, entry.name);
    const [manifestRaw, skillMd] = await Promise.all([
      readFile(join(packagePath, "skill.json"), "utf8"),
      readFile(join(packagePath, "SKILL.md"), "utf8"),
    ]);
    const manifest = parseSkillManifest(JSON.parse(manifestRaw));
    const validation = validateSkillMarkdown(skillMd);
    if (!validation.valid) {
      throw new Error(
        `Skill package ${manifest.id} is missing SKILL.md sections: ${validation.missing.join(", ")}`,
      );
    }
    packages.push({ manifest, packagePath, skillMd });
  }

  return packages.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

async function resolveExistingPackageRoot() {
  for (const root of packageRoots()) {
    try {
      await readdir(root);
      return root;
    } catch {
      // Try next root.
    }
  }
  throw new Error("Built-in Skill package directory not found");
}
