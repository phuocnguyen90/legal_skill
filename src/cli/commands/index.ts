import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
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
        replyInOriginalLanguage?: boolean;
    } = {}
): Promise<string> {
    const { maxIterations = 10, model = appConfig.ai.model, replyInOriginalLanguage } = options;
    const client = createAiClient();
    let currentSystemPrompt = systemPrompt;

    // Inject language constraint if requested
    if (replyInOriginalLanguage) {
        currentSystemPrompt += `\n\n**LANGUAGE CONSTRAINT**: You MUST detect the primary language of the source document and provide your ENTIRE analysis and response in that SAME language. Do not translate back to English unless the document is in English.`;
    }

    const messages: Message[] = [{ role: 'user', content: userMessage }];

    let iterations = 0;
    let languageCheckFailedOnce = false;
    let lastDocumentContent: string | null = null;

    while (iterations < maxIterations) {
        iterations++;

        console.error(`\n🤖 [Iteration ${iterations}] Calling model: ${model}...`);

        const response = await chat(client, messages, {
            systemPrompt: currentSystemPrompt,
            tools: documentTools,
            maxTokens: 8192,
            model,
        });

        // Print text content if present
        const text = getTextContent(response);
        if (text) {
            process.stderr.write(`${text}\n`);
        }

        // If no tool use, check verification
        if (!hasToolUse(response)) {
            // Post-hoc verification if requested and we have a document content to compare against
            if (replyInOriginalLanguage && !languageCheckFailedOnce && lastDocumentContent && text.length > 50) {
                console.error(`\n🔎 Verifying language compliance...`);

                // Quick check using the client
                const verificationPrompt = `Analyze the following two text samples and determine if they are written in the same language.
                 
Sample 1 (Source Document):
${lastDocumentContent.substring(0, 1000)}

Sample 2 (Your Response):
${text.substring(0, 1000)}

Are Sample 1 and Sample 2 in the same language? Reply ONLY with "YES" or "NO".`;

                const checkMessages: Message[] = [{ role: 'user', content: verificationPrompt }];
                const checkResponse = await chat(client, checkMessages, { model, maxTokens: 10 });
                const checkResult = getTextContent(checkResponse).trim().toUpperCase();

                if (checkResult.includes('NO')) {
                    console.error(`❌ Language verification failed. Retrying with translation...`);
                    languageCheckFailedOnce = true;
                    messages.push({ role: 'assistant', content: response.content });
                    messages.push({
                        role: 'user',
                        content: `I noticed your response is not in the same language as the source document. Please TRANSLATE your entire previous response into the language of the source document used in 'read_document'. Do not change the substance of the analysis, just translate it.`
                    });
                    continue; // Loop again
                } else {
                    console.error(`✅ Language verification passed.`);
                }
            }

            return text;
        }

        // Process tool calls
        const toolUseBlocks = getToolUseBlocks(response);
        const toolResults: ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
            console.error(`\n🛠️  [Tool Call] ${toolUse.name}:`, JSON.stringify(toolUse.input));
            const result = await executeDocumentTool(toolUse.name, toolUse.input as Record<string, unknown>);
            console.error(`✅ [Tool Result] ${result.substring(0, 100)}...`);

            // Capture document content for language verification later
            if (toolUse.name === 'read_document') {
                try {
                    const parsed = JSON.parse(result);
                    if (parsed.success && parsed.text) {
                        lastDocumentContent = parsed.text;
                    }
                } catch (e) {
                    // ignore
                }
            }

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
 * Load skill markdown content
 */
function loadSkill(skillName: string): string | null {
    const skillPath = resolve(process.cwd(), 'skills', skillName, 'SKILL.md');
    if (existsSync(skillPath)) {
        return readFileSync(skillPath, 'utf8');
    }
    return null;
}

/**
 * Load command markdown content
 */
function loadCommand(commandName: string): string | null {
    const commandPath = resolve(process.cwd(), 'commands', `${commandName}.md`);
    if (existsSync(commandPath)) {
        return readFileSync(commandPath, 'utf8');
    }
    return null;
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
        replyInOriginalLanguage?: boolean;
    } = {}
): Promise<string> {
    const playbook = loadPlaybook();
    const skillContent = loadSkill('contract-review');
    const commandContent = loadCommand('review-contract');

    const systemPrompt = skillContent || `You are a contract review assistant for an in-house legal team. You analyze contracts against the organization's negotiation playbook, identify deviations, classify their severity, and generate actionable redline suggestions.

${playbook ? `## Organization Playbook\n${playbook}` : '## Note\nNo playbook configured. Using general commercial standards as baseline.'}`;

    const userMessage = `${commandContent ? `Execute command: /review-contract\n\n` : ''}I need you to review a contract at: "${documentPath}"

${options.side ? `We are the ${options.side} in this agreement.` : ''}
${options.focusAreas?.length ? `Focus areas: ${options.focusAreas.join(', ')}` : ''}

Please provide a detailed review using your established methodology.`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}

/**
 * Triage an NDA
 */
export async function triageNda(documentPath: string, options: { model?: string; replyInOriginalLanguage?: boolean } = {}): Promise<string> {
    const playbook = loadPlaybook();
    const skillContent = loadSkill('nda-triage');
    const commandContent = loadCommand('triage-nda');

    const systemPrompt = skillContent || `You are an NDA triage specialist. You rapidly assess incoming NDAs against standard criteria and categorize them for appropriate handling.

${playbook ? `## Organization NDA Standards\n${playbook}` : '## Note\nUsing general NDA standards as baseline.'}`;

    const userMessage = `${commandContent ? `Execute command: /triage-nda\n\n` : ''}Please triage the NDA at: ${documentPath}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}

/**
 * Generate a legal brief
 */
export async function generateBrief(
    type: 'topic' | 'incident',
    query: string,
    options: { model?: string; replyInOriginalLanguage?: boolean } = {}
): Promise<string> {
    const commandContent = loadCommand('brief');

    const systemPrompt = `You are a legal briefing assistant. You generate clear, concise briefings on legal topics or incidents for in-house legal teams.`;

    const userMessage = `${commandContent ? `Execute command: /brief\n\n` : ''}${type === 'topic'
        ? `Generate a research brief on the following legal topic: ${query}`
        : `Generate an incident brief for the following situation: ${query}`}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}

/**
 * Check Compliance
 */
export async function checkCompliance(documentPath: string, options: { model?: string; replyInOriginalLanguage?: boolean } = {}): Promise<string> {
    const skillContent = loadSkill('compliance');

    const systemPrompt = skillContent || `You are a compliance assistant for an in-house legal team. You help with privacy regulation compliance, DPA reviews, and data subject requests.`;

    const userMessage = `Please review the following document for compliance issues: ${documentPath}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}

/**
 * Assess Legal Risk
 */
export async function assessRisk(documentPath: string, options: { model?: string; replyInOriginalLanguage?: boolean } = {}): Promise<string> {
    const skillContent = loadSkill('legal-risk-assessment');

    const systemPrompt = skillContent || `You are a legal risk assessment specialist. You conduct end-to-end risk analysis of documents or business situations.`;

    const userMessage = `Please conduct a full legal risk assessment for: ${documentPath}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}

/**
 * Summarize Meeting
 */
export async function summarizeMeeting(documentPath: string, options: { model?: string; replyInOriginalLanguage?: boolean } = {}): Promise<string> {
    const skillContent = loadSkill('meeting-briefing');

    const systemPrompt = skillContent || `You are a legal meeting assistant. You summarize meeting transcripts and agendas into actionable legal briefs.`;

    const userMessage = `Please summarize the following meeting record and highlight legal action items: ${documentPath}`;

    return await runAgentLoop(systemPrompt, userMessage, { model: options.model, replyInOriginalLanguage: options.replyInOriginalLanguage });
}
