# Ollama Legal Skills

An Ollama-powered wrapper for Anthropic's legal skills with built-in document parsing for PDF, DOCX, and text files. Use local LLMs to review contracts, triage NDAs, and generate legal briefings.

## Features

- **Contract Review** - Analyze contracts against your organization's playbook
- **NDA Triage** - Quick classification of NDAs as GREEN/YELLOW/RED
- **Legal Briefing** - Generate topic or incident briefs
- **Document Parsing** - Built-in PDF, DOCX, TXT, and Markdown support
- **MCP Server** - Expose document reading as MCP tools for other agents
- **Customizable Playbook** - Configure your organization's standard positions

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.com/) v0.14.0+ (with Anthropic API compatibility)
- A code-capable model (e.g., `qwen3-coder`, `gpt-oss:20b`)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ollama-legal-skills.git
cd ollama-legal-skills

# Install dependencies
npm install

# Build the project
npm run build

# (Optional) Link globally for CLI access
npm link
```

## Quick Start

### 1. Start Ollama

```bash
ollama serve
ollama pull gpt-oss:20b
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Review a Contract

```bash
# Using npm
npm run dev review ./path/to/contract.pdf

# Or if globally linked
legal-skill review ./path/to/contract.pdf --side customer
```

## Commands

### Review Contract

Review a contract against your organization's playbook:

```bash
legal-skill review <file> [options]

Options:
  -s, --side <side>     Your side (vendor or customer)
  -f, --focus <areas>   Comma-separated focus areas
  -m, --model <model>   Ollama model to use
```

### Triage NDA

Quick triage of incoming NDAs:

```bash
legal-skill triage <file> [options]

Options:
  -m, --model <model>   Ollama model to use
```

### Generate Brief

Generate legal briefings:

```bash
legal-skill brief <type> <query> [options]

Types: topic, incident
```

### MCP Server

Start the document reader MCP server:

```bash
legal-skill mcp-server
```

### Show Config

Display current configuration:

```bash
legal-skill config
```

## Configuration

Set these via environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `qwen3-coder` | Default model |
| `MCP_SERVER_PORT` | `3100` | MCP server port |
| `PLAYBOOK_PATH` | - | Path to your legal playbook |

## Playbook Configuration

Create a playbook to customize contract review for your organization:

```bash
cp playbooks/sample-playbook.md playbooks/my-playbook.md
# Edit with your positions
export PLAYBOOK_PATH=./playbooks/my-playbook.md
```

See `playbooks/sample-playbook.md` for the template.

## MCP Integration

Use the document server with Claude Code or other MCP-compatible clients:

```json
{
  "mcpServers": {
    "document-reader": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/mcp/document-server.ts"]
    }
  }
}
```

Available tools:
- `read_document` - Extract text from PDF/DOCX/TXT files
- `list_documents` - List documents in a directory
- `get_document_info` - Get file metadata

## Skills

| Skill | Description |
|-------|-------------|
| `contract-review` | Playbook-based contract analysis, deviation classification, redline generation |
| `nda-triage` | NDA screening criteria, classification rules, routing recommendations |
| `legal-risk-assessment` | Risk severity framework, classification levels, escalation criteria |

## License

Apache-2.0

## Disclaimer

This tool assists with legal workflows but does not provide legal advice. Always verify conclusions with qualified legal professionals. AI-generated analysis should be reviewed by licensed attorneys before being relied upon for legal decisions.
