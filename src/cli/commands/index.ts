import { existsSync } from 'fs';
import { resolve } from 'path';
import {
    createAiClient,
    chat,
    hasToolUse,
    getToolUseBlocks,
    getTextContent,
    documentTools,
    type Message,
    type ToolResultBlockParam,
} from '../../ai/index.js';
import { parsePdf, isPdfFile } from '../../mcp/parsers/pdf-parser.js';
import { parseDocx, isDocxFile } from '../../mcp/parsers/docx-parser.js';
import { parseText, isTextFile } from '../../mcp/parsers/text-parser.js';
import { appConfig, loadPlaybook } from '../../config/index.js';

/**
 * Execute a document tool call
 */
async function executeDocumentTool(
    toolName: string,
    toolInput: Record<string, unknown>
): Promise<string> {
    switch (toolName) {
        case 'read_document': {
            const pathValue = toolInput.path;
            if (typeof pathValue !== 'string') {
                console.error(`❌ [Tool Error] 'read_document' called with invalid input:`, JSON.stringify(toolInput));
                return JSON.stringify({ success: false, error: 'Missing or invalid "path" argument. You must provide the "path" to the file.' });
            }
            const filePath = pathValue.trim();
            const resolvedPath = resolve(filePath);

            if (!existsSync(resolvedPath)) {
                return JSON.stringify({ success: false, error: `File not found: ${resolvedPath}` });
            }

            let result;
            if (isPdfFile(resolvedPath)) {
                result = await parsePdf(resolvedPath);
            } else if (isDocxFile(resolvedPath)) {
                result = await parseDocx(resolvedPath);
            } else if (isTextFile(resolvedPath)) {
                result = parseText(resolvedPath);
            } else {
                return JSON.stringify({ success: false, error: 'Unsupported file type' });
            }

            return JSON.stringify({
                success: true,
                text: result.text,
                pageCount: 'pageCount' in result ? result.pageCount : undefined
            });
        }

        default:
            return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
    }
}

/**
 * Run an agent loop with tool use
 */
async function runAgentLoop(
    systemPrompt: string,
    userMessage: string,
    options: {
        maxIterations?: number;
        model?: string;
    } = {}
): Promise<string> {
    const { maxIterations = 10, model = appConfig.ai.model } = options;
    const client = createAiClient();
    const messages: Message[] = [{ role: 'user', content: userMessage }];

    let iterations = 0;

    while (iterations < maxIterations) {
        iterations++;

        console.error(`\n🤖 [Iteration ${iterations}] Calling model: ${model}...`);

        const response = await chat(client, messages, {
            systemPrompt,
            tools: documentTools,
            maxTokens: 8192,
            model,
        });

        // Print text content if present
        const text = getTextContent(response);
        if (text) {
            process.stderr.write(`${text}\n`);
        }

        // If no tool use, return final text
        if (!hasToolUse(response)) {
            return text;
        }

        // Process tool calls
        const toolUseBlocks = getToolUseBlocks(response);
        const toolResults: ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
            console.error(`\n🛠️  [Tool Call] ${toolUse.name}:`, JSON.stringify(toolUse.input));
            const result = await executeDocumentTool(toolUse.name, toolUse.input as Record<string, unknown>);
            console.error(`✅ [Tool Result] ${result.substring(0, 100)}...`);

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result,
            });
        }

        // Add assistant response and tool results to messages
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
    }

    return 'Maximum iterations reached. Please try again with a simpler request.';
}

/**
 * Review a contract against the playbook
 */
export async function reviewContract(
    documentPath: string,
    options: {
        side?: 'vendor' | 'customer';
        focusAreas?: string[];
        model?: string;
    } = {}
): Promise<string> {
    const playbook = loadPlaybook();

    const systemPrompt = `You are a contract review assistant for an in-house legal team. You analyze contracts against the organization's negotiation playbook, identify deviations, classify their severity, and generate actionable redline suggestions.

**Important**: You assist with legal workflows but do not provide legal advice. All analysis should be reviewed by qualified legal professionals before being relied upon.

## Review Process
1. **Read the entire contract** using the read_document tool
2. **Identify the contract type**: SaaS agreement, professional services, license, partnership, procurement, etc.
3. **Analyze each material clause** against the playbook positions
4. **Classify deviations** as GREEN (acceptable), YELLOW (negotiate), or RED (escalate)
5. **Generate specific redline suggestions** for YELLOW and RED items
6. **Provide a summary** with overall risk assessment

## Severity Classification
- **GREEN -- Acceptable**: Terms match or are more favorable than standard positions
- **YELLOW -- Negotiate**: Deviations from standard but within acceptable range; suggest specific language changes
- **RED -- Escalate**: Terms outside acceptable range or contain high-risk provisions; requires senior review

${playbook ? `## Organization Playbook\n${playbook}` : '## Note\nNo playbook configured. Using general commercial standards as baseline.'}`;

    const userMessage = `I need you to review a contract.
    
**Step 1**: Use the 'read_document' tool with the EXACT path: "${documentPath}"

${options.side ? `We are the ${options.side} in this agreement.` : ''}
${options.focusAreas?.length ? `Focus areas: ${options.focusAreas.join(', ')}` : ''}

After reading the file, provide a clause-by-clause analysis with GREEN/YELLOW/RED classifications and specific redline suggestions for any issues.`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model });
}

/**
 * Triage an NDA
 */
export async function triageNda(documentPath: string, options: { model?: string } = {}): Promise<string> {
    const playbook = loadPlaybook();

    const systemPrompt = `You are an NDA triage specialist. You rapidly assess incoming NDAs against standard criteria and categorize them for appropriate handling.

**Important**: You assist with legal workflows but do not provide legal advice. All analysis should be reviewed by qualified legal professionals.

## Triage Categories
- **GREEN (Standard Approval)**: NDA matches standard terms, can be routed for signature
- **YELLOW (Counsel Review)**: Specific issues that need attention but are likely resolvable
- **RED (Significant Issues)**: Non-standard terms or provisions requiring full counsel review

## Key Evaluation Criteria
1. **Mutual vs Unilateral**: Is the NDA mutual?
2. **Definition of Confidential Information**: Appropriately scoped?
3. **Term**: Within acceptable range (typically 2-5 years)?
4. **Permitted Disclosures**: Standard carveouts present?
5. **Return/Destruction**: Standard provisions?
6. **Governing Law**: Acceptable jurisdiction?
7. **Residuals Clause**: If present, is it narrowly scoped?

${playbook ? `## Organization NDA Standards\n${playbook}` : '## Note\nUsing general NDA standards as baseline.'}`;

    const userMessage = `Please triage the NDA at: ${documentPath}

Provide:
1. Overall classification (GREEN/YELLOW/RED)
2. Key findings for each evaluation criterion
3. Specific issues requiring attention (if any)
4. Recommended next steps`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model });
}

/**
 * Generate a legal brief
 */
export async function generateBrief(
    type: 'topic' | 'incident',
    query: string,
    options: { model?: string } = {}
): Promise<string> {
    const systemPrompt = `You are a legal briefing assistant. You generate clear, concise briefings on legal topics or incidents for in-house legal teams.

**Important**: You provide research assistance but not legal advice. Conclusions should be verified with qualified legal professionals.

## Briefing Format
1. **Executive Summary**: Key points in 2-3 sentences
2. **Background**: Relevant context and facts
3. **Analysis**: Legal considerations and implications
4. **Recommendations**: Suggested actions or next steps
5. **References**: Any relevant documents or precedents`;

    const userMessage = type === 'topic'
        ? `Generate a research brief on the following legal topic: ${query}`
        : `Generate an incident brief for the following situation: ${query}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model });
}
