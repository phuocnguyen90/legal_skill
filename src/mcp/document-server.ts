#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, statSync, readdirSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { parsePdf, isPdfFile } from './parsers/pdf-parser.js';
import { parseDocx, isDocxFile } from './parsers/docx-parser.js';
import { parseText, isTextFile } from './parsers/text-parser.js';

// Define available tools
const tools: Tool[] = [
    {
        name: 'read_document',
        description: 'Read and extract text content from a document file (PDF, DOCX, TXT, MD). Returns the full text content of the document.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Absolute or relative path to the document file',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_documents',
        description: 'List all readable documents in a directory. Returns file names, types, and sizes.',
        inputSchema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Path to the directory to list documents from',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to search subdirectories recursively',
                    default: false,
                },
            },
            required: ['directory'],
        },
    },
    {
        name: 'get_document_info',
        description: 'Get metadata information about a document file without reading its full content.',
        inputSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the document file',
                },
            },
            required: ['path'],
        },
    },
];

// Supported document extensions
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.markdown'];

function isSupportedDocument(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
}

async function readDocument(filePath: string): Promise<{ text: string; pageCount?: number; metadata?: Record<string, unknown> }> {
    const resolvedPath = resolve(filePath);

    if (!existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
    }

    if (isPdfFile(resolvedPath)) {
        return await parsePdf(resolvedPath);
    } else if (isDocxFile(resolvedPath)) {
        return await parseDocx(resolvedPath);
    } else if (isTextFile(resolvedPath)) {
        return parseText(resolvedPath);
    } else {
        throw new Error(`Unsupported file type: ${extname(resolvedPath)}. Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    }
}

function listDocuments(directory: string, recursive: boolean = false): Array<{ name: string; path: string; type: string; size: number }> {
    const resolvedDir = resolve(directory);

    if (!existsSync(resolvedDir)) {
        throw new Error(`Directory not found: ${resolvedDir}`);
    }

    const results: Array<{ name: string; path: string; type: string; size: number }> = [];

    function scanDirectory(dir: string) {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = resolve(dir, entry.name);

            if (entry.isFile() && isSupportedDocument(entry.name)) {
                const stats = statSync(fullPath);
                results.push({
                    name: entry.name,
                    path: fullPath,
                    type: extname(entry.name).toLowerCase().slice(1),
                    size: stats.size,
                });
            } else if (entry.isDirectory() && recursive) {
                scanDirectory(fullPath);
            }
        }
    }

    scanDirectory(resolvedDir);
    return results;
}

function getDocumentInfo(filePath: string): { name: string; path: string; type: string; size: number; lastModified: string } {
    const resolvedPath = resolve(filePath);

    if (!existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
    }

    const stats = statSync(resolvedPath);

    return {
        name: basename(resolvedPath),
        path: resolvedPath,
        type: extname(resolvedPath).toLowerCase().slice(1),
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
    };
}

// Create the MCP server
const server = new Server(
    {
        name: 'document-reader',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'read_document': {
                const { path } = args as { path: string };
                const result = await readDocument(path);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                text: result.text,
                                pageCount: result.pageCount,
                                metadata: result.metadata,
                            }, null, 2),
                        },
                    ],
                };
            }

            case 'list_documents': {
                const { directory, recursive = false } = args as { directory: string; recursive?: boolean };
                const documents = listDocuments(directory, recursive);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                count: documents.length,
                                documents,
                            }, null, 2),
                        },
                    ],
                };
            }

            case 'get_document_info': {
                const { path } = args as { path: string };
                const info = getDocumentInfo(path);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: true,
                                ...info,
                            }, null, 2),
                        },
                    ],
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: errorMessage,
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Document Reader MCP Server started');
}

main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
