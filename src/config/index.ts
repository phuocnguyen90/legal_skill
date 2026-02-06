import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
config();

const configSchema = z.object({
    ai: z.object({
        provider: z.enum(['ollama', 'anthropic', 'glm', 'openai']).default('ollama'),
        baseUrl: z.string().url().default('http://localhost:11434'),
        apiKey: z.string().default('ollama'),
        model: z.string().default('gemma3:4b'),
    }),
    mcp: z.object({
        serverPort: z.number().int().positive().default(3100),
    }),
    playbook: z.object({
        path: z.string().optional(),
    }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
    return configSchema.parse({
        ai: {
            provider: process.env.AI_PROVIDER || 'ollama',
            baseUrl: process.env.AI_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            apiKey: process.env.AI_API_KEY || 'ollama',
            model: process.env.AI_MODEL || process.env.OLLAMA_MODEL || 'gemma3:4b',
        },
        mcp: {
            serverPort: parseInt(process.env.MCP_SERVER_PORT || '3100', 10),
        },
        playbook: {
            path: process.env.PLAYBOOK_PATH,
        },
    });
}

export const appConfig = loadConfig();

/**
 * Load the legal playbook content if configured
 */
export function loadPlaybook(): string | null {
    const playbookPath = appConfig.playbook.path;

    if (!playbookPath) {
        return null;
    }

    const resolvedPath = resolve(playbookPath);

    if (!existsSync(resolvedPath)) {
        console.warn(`Playbook not found at: ${resolvedPath}`);
        return null;
    }

    try {
        return readFileSync(resolvedPath, 'utf-8');
    } catch (error) {
        console.warn(`Failed to read playbook: ${error}`);
        return null;
    }
}
