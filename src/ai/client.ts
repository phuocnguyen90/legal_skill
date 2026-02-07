import Anthropic from '@anthropic-ai/sdk';
import { appConfig, getProviderForModel } from '../config/index.js';

export type Message = Anthropic.MessageParam;
export type Tool = Anthropic.Tool;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type ToolUseBlock = Anthropic.ToolUseBlock;

/**
 * Providers with native Anthropic API compatibility
 * These providers can use the Anthropic SDK directly by just setting baseURL
 */
const ANTHROPIC_COMPATIBLE_PROVIDERS = new Set<'anthropic' | 'ollama'>(['anthropic', 'ollama']);

/**
 * Check if a provider has native Anthropic API support
 */
function isAnthropicCompatible(provider: string): provider is 'anthropic' | 'ollama' {
    return ANTHROPIC_COMPATIBLE_PROVIDERS.has(provider as any);
}

/**
 * Create an OpenAI-compatible fetch adapter for providers that don't support Anthropic API
 * (GLM, OpenAI, OpenRouter, etc.)
 */
function createOpenAIAdapter(
    provider: string,
    providerConfig: { baseUrl?: string; apiKey?: string }
): (url: any, init?: any) => Promise<Response> {
    return async (url: any, init?: any): Promise<any> => {
        const bodyData = init?.body ? JSON.parse(init.body) : null;
        const model = bodyData?.model;

        // Build base URL
        let baseUrl = providerConfig?.baseUrl || 'https://api.openai.com/v1';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        // Build chat completions URL
        const chatUrl = new URL(baseUrl);
        // Ensure we have the chat/completions path
        if (provider === 'glm') {
            // GLM-specific path: /api/paas/v4/chat/completions
            if (!chatUrl.pathname.includes('/paas/v4/')) {
                chatUrl.pathname = '/api/paas/v4/chat/completions';
            }
        } else {
            // Standard OpenAI path
            chatUrl.pathname = chatUrl.pathname.endsWith('/')
                ? chatUrl.pathname + 'chat/completions'
                : chatUrl.pathname.replace(/\/v1\/?$/, '') + '/chat/completions';
            if (!chatUrl.pathname.includes('/chat/completions')) {
                chatUrl.pathname = '/v1/chat/completions';
            }
        }

        // Convert Anthropic request to OpenAI format
        const openaiBody: any = {
            model,
            messages: [],
            max_tokens: bodyData?.max_tokens || 8192,
            stream: bodyData?.stream || false,
            temperature: bodyData?.temperature || 1.0,
        };

        // Add system message if present
        if (bodyData?.system) {
            openaiBody.messages.push({ role: 'system', content: bodyData.system });
        }

        // Convert message format (Anthropic → OpenAI)
        for (const msg of bodyData?.messages || []) {
            if (Array.isArray(msg.content)) {
                // Structured content (text, tool_use, tool_result)
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        openaiBody.messages.push({ role: msg.role, content: block.text });
                    } else if (block.type === 'tool_result') {
                        openaiBody.messages.push({
                            role: 'tool',
                            tool_call_id: block.tool_use_id,
                            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
                        });
                    } else if (block.type === 'tool_use') {
                        openaiBody.messages.push({
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: block.id,
                                type: 'function',
                                function: {
                                    name: block.name,
                                    arguments: JSON.stringify(block.input)
                                }
                            }]
                        });
                    }
                }
            } else {
                // Simple string content
                openaiBody.messages.push({ role: msg.role, content: msg.content });
            }
        }

        // Convert tools format (Anthropic → OpenAI)
        if (bodyData?.tools?.length > 0) {
            openaiBody.tools = bodyData.tools.map((tool: any) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            }));
            openaiBody.tool_choice = 'auto';
        }

        // Build headers
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${providerConfig?.apiKey || 'dummy'}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        // OpenRouter-specific headers
        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://github.com/phuoc/legal_skill';
            headers['X-Title'] = 'Legal AI Assistant';
        }

        console.error(`   🌐 [AI Adapter] Fetching (${provider}): ${chatUrl}`);

        // Execute request
        const response = await fetch(chatUrl.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify(openaiBody),
            signal: init?.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`   ❌ [AI Adapter] Error:`, errorText);
            return new Response(errorText, {
                status: response.status,
                headers: response.headers
            });
        }

        // Convert OpenAI response to Anthropic format
        const data: any = await response.json();
        const choice = data.choices?.[0]?.message;

        const anthropicResponse = {
            id: data.id || `msg_${Date.now()}`,
            type: 'message' as const,
            role: 'assistant' as const,
            model: data.model || model,
            content: [] as any[],
            usage: {
                input_tokens: data.usage?.prompt_tokens || 0,
                output_tokens: data.usage?.completion_tokens || 0,
            }
        };

        if (choice?.content) {
            anthropicResponse.content.push({ type: 'text', text: choice.content });
        }

        if (choice?.tool_calls) {
            for (const tc of choice.tool_calls) {
                anthropicResponse.content.push({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.function.name,
                    input: JSON.parse(tc.function.arguments)
                });
            }
        }

        return new Response(JSON.stringify(anthropicResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
}

/**
 * Create an Anthropic SDK client with multi-provider support
 *
 * For Anthropic-compatible providers (Ollama v0.14+, Anthropic):
 *   Uses native Anthropic API by setting baseURL - no transformation needed
 *
 * For OpenAI-compatible providers (GLM, OpenAI, OpenRouter):
 *   Uses a fetch adapter to convert between Anthropic and OpenAI formats
 */
export function createAiClient(): Anthropic {
    return new Anthropic({
        // Default values
        baseURL: 'https://api.anthropic.com',
        apiKey: 'dummy',
        timeout: 300_000,

        // Custom fetch for provider routing
        fetch: async (url: any, init?: any): Promise<any> => {
            // Detect provider from model in request body
            let provider = appConfig.ai.provider;
            let bodyData: any = null;

            if (init?.body) {
                try {
                    bodyData = JSON.parse(init.body);
                    if (bodyData.model) {
                        provider = getProviderForModel(bodyData.model);
                    }
                } catch (e) { /* ignore */ }
            }

            const providerConfig = (appConfig.ai.providers as any)[provider];

            // For Anthropic-compatible providers: Just set baseURL, no transformation
            if (isAnthropicCompatible(provider)) {
                let baseUrl = providerConfig?.baseUrl;

                if (provider === 'ollama') {
                    baseUrl = providerConfig?.baseUrl || 'http://localhost:11434';
                } else if (provider === 'anthropic') {
                    baseUrl = 'https://api.anthropic.com';
                }

                // Update URL to point to the correct provider
                const parsedUrl = new URL(url.toString());
                const providerUrl = new URL(baseUrl || url.toString());
                parsedUrl.protocol = providerUrl.protocol;
                parsedUrl.host = providerUrl.host;
                parsedUrl.port = providerUrl.port;
                // Keep the Anthropic path structure (/v1/messages)

                // Set proper API key for Anthropic
                const anthropicInit = { ...init };
                const headers = new Headers(init?.headers);
                if (provider === 'anthropic' && providerConfig?.apiKey) {
                    headers.set('x-api-key', providerConfig.apiKey);
                } else if (provider === 'ollama') {
                    // Ollama ignores the API key but Anthropic SDK requires one
                    headers.set('x-api-key', 'ollama');
                }
                anthropicInit.headers = headers;

                console.error(`   ✓ Using native Anthropic API (${provider}): ${baseUrl}`);

                return fetch(parsedUrl.toString(), anthropicInit);
            }

            // For OpenAI-compatible providers: Use adapter
            console.error(`   🔄 Using OpenAI adapter (${provider}): ${providerConfig?.baseUrl}`);
            const adapter = createOpenAIAdapter(provider, providerConfig);
            return adapter(url, init);
        }
    });
}

export interface ChatOptions {
    model?: string;
    systemPrompt?: string;
    tools?: Tool[];
    maxTokens?: number;
}

/**
 * Send a message to the model and get a response
 */
export async function chat(
    client: Anthropic,
    messages: Message[],
    options: ChatOptions = {}
): Promise<Anthropic.Message> {
    const {
        model = appConfig.ai.model,
        systemPrompt,
        tools,
        maxTokens = 8192,
    } = options;

    console.error(`   ⌛ Calling model ${model}...`);
    const start = Date.now();
    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools,
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`   ✨ Response received in ${duration}s`);

    return response;
}

/**
 * Stream a message response from the model
 */
export async function* streamChat(
    client: Anthropic,
    messages: Message[],
    options: ChatOptions = {}
): AsyncGenerator<Anthropic.RawMessageStreamEvent> {
    const {
        model = appConfig.ai.model,
        systemPrompt,
        tools,
        maxTokens = 8192,
    } = options;

    const stream = await client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools,
    });

    for await (const event of stream) {
        yield event;
    }
}

/**
 * Check if the response contains tool use
 */
export function hasToolUse(response: Anthropic.Message): boolean {
    return response.content.some(block => block.type === 'tool_use');
}

/**
 * Extract tool use blocks from a response
 */
export function getToolUseBlocks(response: Anthropic.Message): ToolUseBlock[] {
    return response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
    );
}

/**
 * Extract text content from a response
 */
export function getTextContent(response: Anthropic.Message): string {
    return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');
}
