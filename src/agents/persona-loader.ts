import { readFile } from "fs/promises";
import { resolve } from "path";
import type { PersonaConfig } from "../types.js";

interface PersonaFrontmatter {
  name: string;
  role: string;
  perspective: string;
}

export async function loadPersona(
  personaPath: string,
  projectRoot: string
): Promise<PersonaConfig> {
  const fullPath = resolve(projectRoot, personaPath);
  const raw = await readFile(fullPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    name: frontmatter.name,
    perspective: frontmatter.perspective,
    systemPrompt: body.trim(),
  };
}

function parseFrontmatter(content: string): {
  frontmatter: PersonaFrontmatter;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Persona file missing YAML frontmatter");
  }

  const yamlBlock = match[1];
  const body = match[2];

  const frontmatter: Record<string, string> = {};
  for (const line of yamlBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    frontmatter[key] = value;
  }

  return {
    frontmatter: frontmatter as unknown as PersonaFrontmatter,
    body,
  };
}