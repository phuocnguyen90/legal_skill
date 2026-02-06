import { readFileSync } from 'fs';
import pdfParse from 'pdf-parse';

export interface ParsedDocument {
    text: string;
    pageCount?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Parse a PDF file and extract its text content
 */
export async function parsePdf(filePath: string): Promise<ParsedDocument> {
    const dataBuffer = readFileSync(filePath);

    const data = await pdfParse(dataBuffer);

    return {
        text: data.text,
        pageCount: data.numpages,
        metadata: {
            info: data.info,
            version: data.version,
        },
    };
}

/**
 * Check if a file is a PDF by extension
 */
export function isPdfFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.pdf');
}
