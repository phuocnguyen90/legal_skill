import { readFileSync } from 'fs';

export interface ParsedDocument {
    text: string;
    metadata?: Record<string, unknown>;
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.text', '.rst'];

/**
 * Parse a text file and return its content
 */
export function parseText(filePath: string): ParsedDocument {
    const text = readFileSync(filePath, 'utf-8');

    return {
        text,
        metadata: {
            encoding: 'utf-8',
        },
    };
}

/**
 * Check if a file is a plain text file by extension
 */
export function isTextFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return TEXT_EXTENSIONS.some(ext => lower.endsWith(ext));
}
