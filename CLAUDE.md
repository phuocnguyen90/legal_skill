# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ollama Legal Skills is a TypeScript/Node.js CLI tool that provides AI-powered legal document analysis. It wraps Anthropic's legal skill framework and makes it work with multiple AI providers (Ollama, GLM, OpenRouter, OpenAI, Anthropic) through a unified Anthropic-compatible adapter.

## Common Commands

### Development
```bash
# Build TypeScript
npm run build

# Run CLI directly (development mode)
npm run dev review ./path/to/contract.pdf
npm run dev triage ./path/to/nda.pdf
npm run dev brief topic "GDPR compliance requirements"

# Start Web UI server
npm run dev serve

# Start MCP document server
npm run dev mcp-server

# Run tests
npm test

# Lint code
npm run lint

# Clean build artifacts
npm run clean
```

### CLI Usage
```bash
# Review contract against playbook
legal-skill review <file> --side <vendor|customer> --focus <areas> --model <model>

# Triage NDA
legal-skill triage <file>

# Generate legal brief
legal-skill brief <topic|incident> <query>

# Show configuration
legal-skill config
```

## Architecture

### Multi-Provider AI Client (`src/ai/client.ts`)

The core of this project is a multi-provider AI client that uses the Anthropic SDK with provider-specific routing:

- **Anthropic**: Direct API connection (no adapter needed)
- **Ollama v0.14+**: Uses native Anthropic API compatibility - just set baseURL to `http://localhost:11434`
- **GLM/OpenAI/OpenRouter**: Uses OpenAI-compatible API with a fetch adapter to convert request/response formats

**Architecture Design:**
- For **Anthropic-compatible providers** (Ollama, Anthropic): The client simply sets the `baseURL` and `apiKey` - no request/response transformation needed
- For **OpenAI-compatible providers** (GLM, OpenAI, OpenRouter): A fetch adapter converts between Anthropic and OpenAI formats

The adapter detects the provider from the model ID in each request:
1. Model ID prefixes (e.g., `glm-` → GLM, `gpt-` → OpenAI, `claude-` → Anthropic)
2. Model ID format with `/` → OpenRouter (e.g., `nvidia/nemotron-3-nano-30b-a3b:free`)
3. Falls back to default provider from config

**Key Benefit:** Ollama and Anthropic requests have zero transformation overhead - the Anthropic SDK is used natively.

### Dynamic Skill System

The CLI loads skill methodologies dynamically from two sources:

1. **Skills** (`skills/*/SKILL.md`): High-level methodology and domain knowledge
   - `contract-review`: Playbook-based contract analysis
   - `nda-triage`: NDA classification (GREEN/YELLOW/RED)
   - `compliance`: Privacy regulation and DPA review
   - `legal-risk-assessment`: Risk severity framework
   - `meeting-briefing`: Meeting summarization
   - `canned-responses`: Standardized legal responses

2. **Commands** (`commands/*.md`): Task-specific workflows
   - `review-contract.md`: Step-by-step contract review workflow
   - `triage-nda.md`: NDA triage process
   - `brief.md`: Brief generation
   - `vendor-check.md`: Vendor assessment
   - `respond.md`: Response generation

Both are loaded at runtime by `src/cli/commands/index.ts` and injected into the system prompt.

### Agent Loop with Tool Use (`src/cli/commands/index.ts`)

The `runAgentLoop` function implements a conversational agent loop:

1. Sends user message to AI with `documentTools` (read_document tool)
2. If AI calls `read_document`, executes the appropriate parser (PDF/DOCX/TXT)
3. Returns tool result and continues conversation
4. Repeats until AI provides final answer or max iterations (10) reached

**Language Verification Feature**: When `replyInOriginalLanguage` is enabled, the agent:
- Detects document language
- Verifies response matches document language using a secondary AI check
- Retries with translation request if language mismatch detected

### Document Parsing (`src/mcp/parsers/`)

Three parsers support different file formats:

- **PDF** (`pdf-parser.ts`): Uses `pdf-parse` library
- **DOCX** (`docx-parser.ts`): Uses `mammoth` library
- **Text** (`text-parser.ts`): Native file reading for TXT, MD, and other text files

All parsers return `{ text: string, pageCount?: number, metadata?: Record<string, unknown> }`.

### MCP Server (`src/mcp/document-server.ts`)

Implements Model Context Protocol server with three tools:
- `read_document`: Parse and extract text from files
- `list_documents`: List supported documents in a directory
- `get_document_info`: Get file metadata

Uses stdio transport for integration with Claude Code or other MCP clients.

### Configuration (`src/config/index.ts`)

Environment-based configuration with Zod validation:

- `AI_PROVIDER`: Active provider (ollama, anthropic, glm, openai, openrouter)
- `AI_MODEL`: Override model (auto-detects provider if omitted)
- `PLAYBOOK_PATH`: Path to legal playbook markdown file
- Provider-specific settings (base URLs, API keys, default models)

`getProviderForModel()` maps model IDs to providers for dynamic provider selection.

## Code Organization

```
src/
├── ai/
│   ├── client.ts       # Multi-provider AI client with adapter
│   ├── tools.ts        # Tool definitions
│   └── index.ts        # AI utilities (chat, stream, extraction helpers)
├── cli/
│   ├── index.ts        # Commander-based CLI entry point
│   └── commands/
│       └── index.ts    # Command implementations (review, triage, brief, etc.)
├── config/
│   └── index.ts        # Configuration loading and validation
├── mcp/
│   ├── document-server.ts  # MCP server implementation
│   └── parsers/
│       ├── pdf-parser.ts
│       ├── docx-parser.ts
│       └── text-parser.ts
└── server/
    ├── index.ts        # Express web server
    └── routes.ts       # API routes

skills/
└── <skill-name>/SKILL.md    # Domain knowledge methodology

commands/
└── <command-name>.md         # Task-specific workflows

playbooks/
└── <playbook-name>.md        # Legal negotiation positions
```

## Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Minimum for local Ollama
AI_PROVIDER=ollama
AI_MODEL=gemma3:12b
OLLAMA_BASE_URL=http://localhost:11434

# Or for cloud provider
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=nvidia/nemotron-3-nano-30b-a3b:free
```

## Working with This Codebase

### Adding a New Legal Skill

1. Create `skills/<skill-name>/SKILL.md` with methodology
2. Add corresponding command in `commands/<command-name>.md` if needed
3. Export new function in `src/cli/commands/index.ts`
4. Add CLI command in `src/cli/index.ts`

### Adding a New AI Provider

**For Anthropic-compatible providers:**
1. Add provider name to `ANTHROPIC_COMPATIBLE_PROVIDERS` set in `src/ai/client.ts`
2. Add provider schema to `src/config/index.ts`
3. Add environment variable loading in config
4. Update `getProviderForModel()` if model has identifiable prefix

**For OpenAI-compatible providers:**
1. Add provider schema to `src/config/index.ts`
2. Add environment variable loading in config
3. Update `getProviderForModel()` if model has identifiable prefix
4. Add any provider-specific path handling in `createOpenAIAdapter()` function (like GLM's `/paas/v4/` path)

### Testing Document Parsing

Use the MCP server mode to test parsing:
```bash
npm run dev mcp-server
```

Then configure MCP client to call `read_document` with file paths.

### Language Handling

The system includes an "reply in original language" feature that:
1. Auto-detects source document language
2. Generates response in same language
3. Post-verifies with AI and retries if needed

This is handled in `runAgentLoop()` function in `src/cli/commands/index.ts`.
