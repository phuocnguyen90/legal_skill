import Anthropic from '@anthropic-ai/sdk';
import { appConfig } from '../config/index.js';

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
    const provider = appConfig.ai.provider;

    return new Anthropic({
        baseURL: appConfig.ai.baseUrl,
        apiKey: appConfig.ai.apiKey,
        timeout: 300_000, // 5 minutes for local/large model inference

        // Custom fetch acting as an adapter for non-Anthropic providers (like GLM/OpenAI)
        fetch: async (url: any, init?: any): Promise<any> => {
            const urlString = url.toString();

            // Logic for GLM/OpenAI compatible providers
            if (provider === 'glm' || provider === 'openai') {
                let finalUrl = urlString;

                // 1. Path Transformation: Anthropic SDK uses /messages, GLM/OpenAI uses /chat/completions
                try {
                    const parsedUrl = new URL(urlString);
                    if (parsedUrl.pathname.endsWith('/v1/messages') || parsedUrl.pathname.endsWith('/messages')) {
                        parsedUrl.pathname = parsedUrl.pathname
                            .replace(/\/v1\/messages$/, '/chat/completions')
                            .replace(/\/messages$/, '/chat/completions');

                        // Special fix for GLM to inject /paas/v4
                        if (provider === 'glm' && !parsedUrl.pathname.includes('/paas/v4/')) {
                            // Ensure the path contains /api/paas/v4/chat/completions
                            if (parsedUrl.pathname.includes('/api/')) {
                                parsedUrl.pathname = parsedUrl.pathname.replace(/\/api\//, '/api/paas/v4/');
                            } else {
                                parsedUrl.pathname = '/api/paas/v4' + (parsedUrl.pathname.startsWith('/') ? '' : '/') + parsedUrl.pathname;
                            }
                        }
                        finalUrl = parsedUrl.toString();
                    }
                } catch (e) {
                    console.error('⚠️ [AI Adapter] URL parsing failed:', e);
                }

                // 2. Header Transformation
                const apiKey = getHeaderValue(init?.headers, 'x-api-key') || appConfig.ai.apiKey;

                const finalHeaders: Record<string, string> = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                };

                // Copy other headers selectively
                if (init?.headers) {
                    const h = init.headers;
                    const keys = typeof h.keys === 'function' ? Array.from(h.keys() as any) : Object.keys(h);

                    for (const key of keys) {
                        const lowKey = (key as string).toLowerCase();
                        if (
                            !lowKey.startsWith('anthropic') &&
                            lowKey !== 'x-api-key' &&
                            lowKey !== 'content-type' &&
                            lowKey !== 'accept' &&
                            lowKey !== 'authorization' &&
                            lowKey !== 'connection' &&
                            lowKey !== 'host' &&
                            lowKey !== 'content-length' &&
                            lowKey !== 'transfer-encoding' &&
                            lowKey !== 'user-agent'
                        ) {
                            finalHeaders[key as string] = typeof h.get === 'function' ? h.get(key) : (h as any)[key as any];
                        }
                    }
                }

                let finalBody = init?.body;

                // 3. Body Transformation: Anthropic -> OpenAI/GLM
                const isPost = init?.method && init.method.toUpperCase() === 'POST';
                if (isPost && init.body) {
                    try {
                        const bodyStr = typeof init.body === 'string' ? init.body : init.body.toString();
                        const anthropicBody = JSON.parse(bodyStr);

                        const openaiBody: any = {
                            model: anthropicBody.model,
                            messages: [],
                            max_tokens: anthropicBody.max_tokens,
                            stream: anthropicBody.stream || false,
                            temperature: anthropicBody.temperature || 1.0,
                        };

                        // Convert System Prompt
                        if (anthropicBody.system) {
                            openaiBody.messages.push({ role: 'system', content: anthropicBody.system });
                        }

                        // Convert Messages
                        if (Array.isArray(anthropicBody.messages)) {
                            for (const msg of anthropicBody.messages) {
                                if (Array.isArray(msg.content)) {
                                    // Handle complex content (like tool results)
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
                                            // Assistant's tool use
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

                        // Convert Tools
                        if (Array.isArray(anthropicBody.tools) && anthropicBody.tools.length > 0) {
                            openaiBody.tools = anthropicBody.tools.map((tool: any) => ({
                                type: 'function',
                                function: {
                                    name: tool.name,
                                    description: tool.description,
                                    parameters: tool.input_schema
                                }
                            }));
                            openaiBody.tool_choice = 'auto';
                        }

                        finalBody = JSON.stringify(openaiBody);
                        console.error(`   📤 [AI Adapter] Payload transformed for ${provider}`);
                    } catch (e) {
                        console.error('⚠️ [AI Adapter] Request transform failed:', e);
                    }
                } else if (isPost) {
                    console.error('   ⚠️ [AI Adapter] POST request missing body');
                }

                // Execute the request
                console.error(`   🌐 [AI Adapter] Fetching: ${finalUrl}`);
                const response = await fetch(finalUrl, {
                    method: init?.method || 'GET',
                    headers: finalHeaders,
                    body: finalBody,
                    signal: init?.signal,
                    redirect: 'follow'
                });

                console.error(`   📥 [AI Adapter] Status: ${response.status} ${response.statusText}`);

                // 4. Response Transformation: OpenAI/GLM -> Anthropic
                if (response.ok && !urlString.includes('stream=true')) {
                    const data: any = await response.json();

                    if (!data.choices || !data.choices[0]) {
                        console.error(`   ⚠️ [AI Adapter] Unexpected response structure:`, JSON.stringify(data));
                        const errorMsg = data.msg || data.message || (data.error && (data.error.message || data.error.msg));
                        if (errorMsg || (data.code && data.code !== 200)) {
                            return new Response(JSON.stringify({
                                error: { type: 'api_error', message: errorMsg || `API Error ${data.code}` }
                            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                        }
                    } else {
                        console.error(`   📦 [AI Adapter] Received data (model: ${data.model || 'unknown'})`);
                    }

                    const anthropicResponse = {
                        id: data.id || `msg_${Date.now()}`,
                        type: 'message',
                        role: 'assistant',
                        model: data.model || appConfig.ai.model,
                        content: [] as any[],
                        usage: {
                            input_tokens: data.usage?.prompt_tokens || 0,
                            output_tokens: data.usage?.completion_tokens || 0,
                        }
                    };

                    const choice = data.choices?.[0]?.message;
                    if (choice) {
                        if (choice.content) {
                            anthropicResponse.content.push({ type: 'text', text: choice.content });
                        }
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

                    return new Response(JSON.stringify(anthropicResponse), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`   ❌ [AI Adapter] Error body:`, errorText);
                    return new Response(errorText, {
                        status: response.status,
                        headers: response.headers
                    });
                }

                return response;
            }

            return fetch(url, init);
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
