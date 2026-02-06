import { readFileSync } from 'fs';
import mammoth from 'mammoth';

export interface ParsedDocument {
    text: string;
    metadata?: Record<string, unknown>;
}

/**
 * Parse a DOCX file and extract its text content
 */
export async function parseDocx(filePath: string): Promise<ParsedDocument> {
    const buffer = readFileSync(filePath);

    const result = await mammoth.extractRawText({ buffer });

    return {
        text: result.value,
        metadata: {
            messages: result.messages,
        },
    };
}

/**
 * Check if a file is a DOCX by extension
 */
export function isDocxFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.endsWith('.docx') || lower.endsWith('.doc');
}
