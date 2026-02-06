import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
config();

const providerSchema = z.object({
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    defaultModel: z.string().optional(),
});

const configSchema = z.object({
    ai: z.object({
        provider: z.enum(['ollama', 'anthropic', 'glm', 'openai', 'openrouter']).default('ollama'),
        model: z.string().default('gemma3:4b'),
        // Backward compatibility properties
        baseUrl: z.string().optional(),
        apiKey: z.string().optional(),
        providers: z.object({
            ollama: providerSchema,
            anthropic: providerSchema,
            glm: providerSchema,
            openai: providerSchema,
            openrouter: providerSchema,
        })
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
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const ollamaApiKey = process.env.OLLAMA_API_KEY || 'ollama';
    const ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:12b';

    const provider = (process.env.AI_PROVIDER || 'ollama') as Config['ai']['provider'];

    const providers = {
        ollama: {
            baseUrl: ollamaBaseUrl,
            apiKey: ollamaApiKey,
            defaultModel: ollamaModel,
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
        },
        glm: {
            baseUrl: process.env.GLM_BASE_URL || 'https://api.z.ai/api/',
            apiKey: process.env.GLM_API_KEY,
            defaultModel: process.env.GLM_MODEL || 'glm-4.5',
        },
        openai: {
            baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/',
            apiKey: process.env.OPENAI_API_KEY,
            defaultModel: process.env.OPENAI_MODEL || 'gpt-4o',
        },
        openrouter: {
            baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/',
            apiKey: process.env.OPENROUTER_API_KEY,
            defaultModel: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free',
        },
    };

    const activeProviderConfig = (providers as any)[provider];

    return configSchema.parse({
        ai: {
            provider,
            model: process.env.AI_MODEL || activeProviderConfig?.defaultModel || ollamaModel,
            baseUrl: activeProviderConfig?.baseUrl,
            apiKey: activeProviderConfig?.apiKey,
            providers
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
 * Helper to get provider name from model ID if explicitly passed
 */
export function getProviderForModel(modelId: string): Config['ai']['provider'] {
    if (modelId.includes('/') && !modelId.startsWith('glm')) {
        // Models with slashes (except glm) are usually OpenRouter models in our UI
        return 'openrouter';
    }
    if (modelId.startsWith('glm')) return 'glm';
    if (modelId.startsWith('gpt-')) return 'openai';
    if (modelId.startsWith('claude-')) return 'anthropic';

    // Default to ollama for everything else (like gemma, llama)
    return 'ollama';
}

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
