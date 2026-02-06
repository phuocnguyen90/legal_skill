import type { Tool } from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Document reading tool for use with the legal skills
 */
export const readDocumentTool: Tool = {
    name: 'read_document',
    description: 'Read and extract text content from a document file (PDF, DOCX, TXT, MD). Use this to read contracts, NDAs, agreements, and other legal documents.',
    input_schema: {
        type: 'object' as const,
        properties: {
            path: {
                type: 'string',
                description: 'Absolute or relative path to the document file',
            },
        },
        required: ['path'],
    },
};

/**
 * List documents tool for browsing available files
 */
export const listDocumentsTool: Tool = {
    name: 'list_documents',
    description: 'List all readable documents (PDF, DOCX, TXT, MD) in a directory. Use this to discover available documents for review.',
    input_schema: {
        type: 'object' as const,
        properties: {
            directory: {
                type: 'string',
                description: 'Path to the directory to list documents from',
            },
            recursive: {
                type: 'boolean',
                description: 'Whether to search subdirectories recursively',
            },
        },
        required: ['directory'],
    },
};

/**
 * Document info tool for getting metadata
 */
export const getDocumentInfoTool: Tool = {
    name: 'get_document_info',
    description: 'Get metadata information about a document file (size, type, last modified) without reading its full content.',
    input_schema: {
        type: 'object' as const,
        properties: {
            path: {
                type: 'string',
                description: 'Path to the document file',
            },
        },
        required: ['path'],
    },
};

/**
 * All document tools for use with legal skills
 */
export const documentTools: Tool[] = [
    readDocumentTool,
    listDocumentsTool,
    getDocumentInfoTool,
];
