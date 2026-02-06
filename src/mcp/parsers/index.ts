export { parsePdf, isPdfFile } from './pdf-parser.js';
export { parseDocx, isDocxFile } from './docx-parser.js';
export { parseText, isTextFile } from './text-parser.js';

export interface ParsedDocument {
    text: string;
    pageCount?: number;
    metadata?: Record<string, unknown>;
}
