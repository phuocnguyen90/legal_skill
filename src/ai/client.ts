import Anthropic from '@anthropic-ai/sdk';
import { appConfig, getProviderForModel } from '../config/index.js';

export type Message = Anthropic.MessageParam;
export type Tool = Anthropic.Tool;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type ToolUseBlock = Anthropic.ToolUseBlock;

/**
 * Robustly extract a header value from various header formats
 */
function getHeaderValue(headers: any, name: string): string | null {
    if (!headers) return null;
    const lowerName = name.toLowerCase();

    // 1. Headers object (standard Web API)
    if (typeof headers.get === 'function') {
        return headers.get(lowerName);
    }

    // 2. Plain object
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lowerName) {
            return headers[key];
        }
    }

    return null;
}

/**
 * Create an Anthropic-compatible AI client with provider-specific adapters
 */
export function createAiClient(): Anthropic {
    return new Anthropic({
        // Default values, can be overridden in fetch
        baseURL: 'https://api.anthropic.com',
        apiKey: 'dummy',
        timeout: 300_000,

        // Custom fetch acting as an adapter for non-Anthropic providers
        fetch: async (url: any, init?: any): Promise<any> => {
            const urlString = url.toString();
            let finalUrl = urlString;
            let finalBody = init?.body;
            let currentProvider: any = appConfig.ai.provider;
            let bodyData: any = null;

            // 1. Determine Provider and Model from request
            if (init?.body) {
                try {
                    bodyData = JSON.parse(init.body);
                    if (bodyData.model) {
                        currentProvider = getProviderForModel(bodyData.model);
                    }
                } catch (e) { /* ignore */ }
            }

            const providerConfig = (appConfig.ai.providers as any)[currentProvider];

            // 2. Handle OpenAI-compatible providers (Ollama, GLM, OpenAI, OpenRouter)
            if (currentProvider !== 'anthropic') {
                // Determine Base URL
                let baseUrl = providerConfig?.baseUrl || urlString.split('/v1')[0];
                if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

                // Path Transformation
                try {
                    const parsedUrl = new URL(urlString);
                    if (parsedUrl.pathname.endsWith('/v1/messages') || parsedUrl.pathname.endsWith('/messages')) {
                        // Use provider specific base URL if available
                        if (providerConfig?.baseUrl) {
                            const providerUrl = new URL(providerConfig.baseUrl);
                            parsedUrl.protocol = providerUrl.protocol;
                            parsedUrl.host = providerUrl.host;
                            parsedUrl.pathname = providerUrl.pathname;
                            if (parsedUrl.pathname.endsWith('/')) parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
                        }

                        // Apply standardized chat conversion path
                        if (parsedUrl.pathname.endsWith('/v1/messages')) {
                            parsedUrl.pathname = parsedUrl.pathname.replace(/\/v1\/messages$/, '/v1/chat/completions');
                        } else if (parsedUrl.pathname.endsWith('/messages')) {
                            parsedUrl.pathname = parsedUrl.pathname.replace(/\/messages$/, '/chat/completions');
                        } else {
                            // If it was just a base URL, append chat/completions
                            parsedUrl.pathname += '/chat/completions';
                        }

                        // GLM Specific injection
                        if (currentProvider === 'glm') {
                            parsedUrl.pathname = parsedUrl.pathname.replace(/\/v1\/chat\/completions$/, '/chat/completions');
                            if (!parsedUrl.pathname.includes('/paas/v4/')) {
                                if (parsedUrl.pathname.includes('/api/')) {
                                    parsedUrl.pathname = parsedUrl.pathname.replace(/\/api\//, '/api/paas/v4/');
                                } else {
                                    parsedUrl.pathname = '/api/paas/v4' + (parsedUrl.pathname.startsWith('/') ? '' : '/') + parsedUrl.pathname;
                                }
                            }
                        }
                        finalUrl = parsedUrl.toString();
                    }
                } catch (e) {
                    console.error('⚠️ [AI Adapter] URL transformation failed:', e);
                }

                // Header Transformation
                const apiKey = providerConfig?.apiKey || getHeaderValue(init?.headers, 'x-api-key');
                const finalHeaders: Record<string, string> = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                };

                if (currentProvider === 'openrouter') {
                    finalHeaders['HTTP-Referer'] = 'https://github.com/phuoc/legal_skill';
                    finalHeaders['X-Title'] = 'Legal AI Assistant';
                }

                if (init?.headers) {
                    const h = init.headers;
                    const keys = typeof h.keys === 'function' ? Array.from(h.keys() as any) : Object.keys(h);
                    for (const key of keys) {
                        const lowKey = (key as string).toLowerCase();
                        if (!['anthropic-version', 'x-api-key', 'content-type', 'accept', 'authorization', 'connection', 'host', 'content-length', 'user-agent'].includes(lowKey)) {
                            finalHeaders[key as string] = typeof h.get === 'function' ? h.get(key) : (h as any)[key as any];
                        }
                    }
                }

                // Body Transformation
                if (init?.method?.toUpperCase() === 'POST' && bodyData) {
                    const openaiBody: any = {
                        model: bodyData.model,
                        messages: [],
                        max_tokens: bodyData.max_tokens,
                        stream: bodyData.stream || false,
                        temperature: bodyData.temperature || 1.0,
                    };

                    if (bodyData.system) {
                        openaiBody.messages.push({ role: 'system', content: bodyData.system });
                    }

                    if (Array.isArray(bodyData.messages)) {
                        for (const msg of bodyData.messages) {
                            if (Array.isArray(msg.content)) {
                                for (const block of msg.content) {
                                    if (block.type === 'text') openaiBody.messages.push({ role: msg.role, content: block.text });
                                    else if (block.type === 'tool_result') {
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
                                                function: { name: block.name, arguments: JSON.stringify(block.input) }
                                            }]
                                        });
                                    }
                                }
                            } else {
                                openaiBody.messages.push({ role: msg.role, content: msg.content });
                            }
                        }
                    }

                    if (Array.isArray(bodyData.tools) && bodyData.tools.length > 0) {
                        openaiBody.tools = bodyData.tools.map((tool: any) => ({
                            type: 'function',
                            function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
                        }));
                        openaiBody.tool_choice = 'auto';
                    }
                    finalBody = JSON.stringify(openaiBody);
                }

                // Execute
                console.error(`   🌐 [AI Adapter] Fetching (${currentProvider}): ${finalUrl}`);
                const response = await fetch(finalUrl, {
                    method: init?.method || 'GET',
                    headers: finalHeaders,
                    body: finalBody,
                    signal: init?.signal,
                    redirect: 'follow'
                });

                if (response.ok && !urlString.includes('stream=true')) {
                    const data: any = await response.json();
                    const anthropicResponse = {
                        id: data.id || `msg_${Date.now()}`,
                        type: 'message',
                        role: 'assistant',
                        model: data.model || bodyData?.model,
                        content: [] as any[],
                        usage: {
                            input_tokens: data.usage?.prompt_tokens || 0,
                            output_tokens: data.usage?.completion_tokens || 0,
                        }
                    };

                    const choice = data.choices?.[0]?.message;
                    if (choice) {
                        if (choice.content) anthropicResponse.content.push({ type: 'text', text: choice.content });
                        if (choice.tool_calls) {
                            for (const tc of choice.tool_calls) {
                                anthropicResponse.content.push({
                                    type: 'tool_use',
                                    id: tc.id,
                                    name: tc.function.name,
                                    input: JSON.parse(tc.function.arguments)
                                });
                            }
                        }
                    }
                    return new Response(JSON.stringify(anthropicResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`   ❌ [AI Adapter] Error:`, errorText);
                    return new Response(errorText, { status: response.status, headers: response.headers });
                }
                return response;
            }

            // Standard Anthropic handling
            const apiKey = providerConfig?.apiKey || getHeaderValue(init?.headers, 'x-api-key');
            const anthropicInit = { ...init };
            if (apiKey) {
                const headers = new Headers(init?.headers);
                headers.set('x-api-key', apiKey);
                anthropicInit.headers = headers;
            }

            return fetch(finalUrl, anthropicInit);
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
