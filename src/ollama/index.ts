export {
    createOllamaClient,
    chat,
    streamChat,
    hasToolUse,
    getToolUseBlocks,
    getTextContent,
} from './client.js';
export type { Message, Tool, ContentBlock, ChatOptions, ToolResultBlockParam } from './client.js';
export { documentTools, readDocumentTool, listDocumentsTool, getDocumentInfoTool } from './tools.js';
