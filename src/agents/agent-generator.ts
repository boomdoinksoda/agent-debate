import Anthropic from "@anthropic-ai/sdk";
import { writeFile, mkdir } from "fs/promises";
import { resolve } from "path";

const client = new Anthropic();

export async function generateFromDescription(
  roleName: string,
  description: string,
  outputDir: string
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system:
      "You generate Claude Code agent persona definitions. Output ONLY the markdown file content with YAML frontmatter (name, role, perspective) and a system prompt body. No explanation.",
    messages: [
      {
        role: "user",
        content: `Generate an agent persona for the role "${roleName}" with this description:\n\n${description}\n\nThe agent will be used in a code review/coding pipeline. Format as a markdown file with ---frontmatter--- and a system prompt body.`,
      },
    ],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";
  const filename = `${roleName.replace(/[:/]/g, "-")}.md`;
  const outputPath = resolve(outputDir, filename);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, content, "utf-8");

  return outputPath;
}

export async function generateFromCodeReference(
  roleName: string,
  referencePath: string,
  outputDir: string
): Promise<string> {
  const { execSync } = await import("child_process");

  const analysisPrompt = `Analyze the code at "${referencePath}" and identify:
- Naming conventions
- Error handling style
- File organization patterns
- Test structure and patterns
- Comment style
- PR scoping patterns

Then generate a Claude Code agent persona markdown file for the role "${roleName}" that writes code matching these patterns exactly. Output ONLY the markdown file with ---frontmatter--- (name, role, perspective) and a system prompt body.`;

  const result = execSync(
    `claude --print "${analysisPrompt.replace(/"/g, '\\"')}"`,
    {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 120000,
    }
  );

  const filename = `${roleName.replace(/[:/]/g, "-")}.md`;
  const outputPath = resolve(outputDir, filename);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, result, "utf-8");

  return outputPath;
}