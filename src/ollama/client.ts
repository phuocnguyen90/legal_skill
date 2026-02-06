import Anthropic from '@anthropic-ai/sdk';
import { appConfig } from '../config/index.js';

export type Message = Anthropic.MessageParam;
export type Tool = Anthropic.Tool;
export type ContentBlock = Anthropic.ContentBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
export type ToolUseBlock = Anthropic.ToolUseBlock;

/**
 * Create an Anthropic client configured to use Ollama
 */
export function createOllamaClient(): Anthropic {
    return new Anthropic({
        baseURL: appConfig.ollama.baseUrl,
        apiKey: 'ollama', // Required by SDK but ignored by Ollama
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
        model = appConfig.ollama.model,
        systemPrompt,
        tools,
        maxTokens = 8192,
    } = options;

    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        tools,
    });

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
        model = appConfig.ollama.model,
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
