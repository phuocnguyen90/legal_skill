# AI Legal Skills Wrapper

> **A simple wrapper for Anthropic's Skills framework** - Democratizing access to masterfully crafted AI skill methodologies for users who want flexibility in model choice.

## 🎯 Purpose

This is **not** a "reinventing the wheel" project. It's a practical wrapper that solves a specific problem:

**Lawyers and legal professionals are interested in the skill sets released by Anthropic**, but they face two barriers:
1. They may not have an active Claude API subscription
2. They aren't comfortable working with CLI tools like Claude Code

This wrapper aims to simplify the experience, allowing you to use **any model of your choice** with the skill methodologies that have been masterfully crafted by the Anthropic team.

### What This Means

- ✅ **Use local LLMs** (Ollama) or cloud models (OpenRouter, GLM, OpenAI) with Anthropic's skills
- ✅ **Web-based UI** - No CLI required
- ✅ **Multi-provider support** - Switch between models freely
- ✅ **Not just legal skills** - Can use any skills from Anthropic's skill set

### The Trade-offs

Simplification comes with costs. This wrapper **cannot** interact with most of the advanced features available when running Claude Code natively:

- ❌ No email automation
- ❌ No Slack integration
- ❌ No filesystem automation beyond document reading
- ❌ Limited tool ecosystem compared to native Claude Code

These limitations would require significant modification to overcome.

**Bottom line:** This is a **demo for Windows/Linux users** to get a peek at how Claude "skills" might work, with the freedom to choose your own AI model.

---

## Features

- **Contract Review** - Analyze contracts against your organization's playbook
- **NDA Triage** - Quick classification of NDAs as GREEN/YELLOW/RED
- **Compliance & Privacy** - Review DPAs and navigate privacy regulations (GDPR, CCPA)
- **Risk Assessment** - Conduct end-to-end legal risk analysis
- **Meeting Briefing** - Summarize transcripts and agendas into actionable briefs
- **Legal Research** - Generate topic or incident briefs
- **Document Parsing** - Built-in PDF, DOCX, TXT, and Markdown support
- **Custom Instructions** - Add your own context to each analysis
- **Multi-Model Support** - Use Ollama, GLM, OpenAI, OpenRouter, or Anthropic

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An AI model provider (at least one):
  - **Ollama** v0.14.0+ (for local models) - [Install](https://ollama.com/)
  - **OpenRouter** API key (for cloud models)
  - **GLM** API key (Zhipu AI)
  - **OpenAI** API key
  - **Anthropic** API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-skills-wrapper.git
cd ai-skills-wrapper

# Install dependencies
npm install

# Build the project
npm run build
```

### Configure

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your preferred provider
# For Ollama (recommended for local use):
AI_PROVIDER=ollama
AI_MODEL=gemma3:12b
OLLAMA_BASE_URL=http://localhost:11434

# For OpenRouter (cloud models):
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=nvidia/nemotron-3-nano-30b-a3b:free
```

### Run the Web UI

```bash
npm run serve
```

Open your browser to `http://localhost:3000`

---

## Usage

### Web Interface (Recommended)

1. Select your preferred model from the sidebar
2. Choose a tool (Contract Review, NDA Triage, etc.)
3. Optionally add custom instructions
4. Drag & drop your document
5. Get AI-powered analysis

### CLI (Advanced)

```bash
# Review a contract
npm run dev review ./path/to/contract.pdf --side customer

# Triage an NDA
npm run dev triage ./path/to/nda.pdf

# Generate a legal brief
npm run dev brief topic "GDPR compliance requirements for SaaS"
```

---

## Supported Providers

| Provider | Models | Use Case |
|----------|--------|----------|
| **Ollama** | gemma3:12b, qwen3-coder, gpt-oss:20b | Local, privacy-focused |
| **OpenRouter** | nvidia/nemotron-3-nano-30b-a3b:free, llama-3.3-70b | Free cloud options |
| **GLM** | glm-4.5 | Chinese language optimized |
| **OpenAI** | gpt-4o, gpt-4-turbo | Premium quality |
| **Anthropic** | claude-3-5-sonnet-20240620 | Native Claude models |

---

## Skills Included

This wrapper includes the legal skills from Anthropic's skill set:

| Skill | Description |
|-------|-------------|
| `contract-review` | Playbook-based contract analysis, deviation classification, redline generation |
| `nda-triage` | NDA screening criteria, classification rules, routing recommendations |
| `compliance` | Privacy regulation guidance, DPA review checklist, DSAR handling |
| `legal-risk-assessment` | Risk severity framework, classification levels, escalation criteria |
| `meeting-briefing` | Meeting summarization, legal action item tracking, agenda synthesis |
| `canned-responses` | Standardized legal response templates and logic |

**Note:** These are the methodologies crafted by Anthropic's team. This wrapper simply makes them accessible with different AI models.

---

## Extending to Other Skills

While this demo focuses on legal skills, the architecture supports any skill from Anthropic's skill set:

1. Add the skill markdown to `skills/<skill-name>/SKILL.md`
2. Add any command workflows to `commands/<command-name>.md`
3. The system automatically loads and applies them

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI / CLI                             │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Anthropic SDK Layer                          │
│              (Multi-provider routing)                           │
└─────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
┌──────────────────────────┐        ┌──────────────────────────┐
│  Anthropic-Compatible    │        │   OpenAI-Compatible       │
│  (Native support)        │        │   (Adapter required)      │
├──────────────────────────┤        ├──────────────────────────┤
│ • Ollama v0.14+          │        │ • GLM                     │
│ • Anthropic              │        │ • OpenAI                  │
│   Zero overhead!         │        │ • OpenRouter              │
└──────────────────────────┘        └──────────────────────────┘
```

**Key Design:** Ollama v0.14+ and Anthropic use native API calls (no transformation). Other providers use a lightweight adapter to convert between Anthropic and OpenAI formats.

---

## Configuration Reference

| Environment Variable | Description |
|---------------------|-------------|
| `AI_PROVIDER` | Active provider (ollama, anthropic, glm, openai, openrouter) |
| `AI_MODEL` | Model to use (auto-detected from provider if omitted) |
| `OLLAMA_BASE_URL` | Ollama server URL (default: http://localhost:11434) |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `GLM_API_KEY` | GLM (Zhipu AI) API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `PLAYBOOK_PATH` | Path to your legal playbook markdown file |

---

## License

Apache-2.0

## Disclaimer

This tool assists with legal workflows but does not provide legal advice. Always verify conclusions with qualified legal professionals. AI-generated analysis should be reviewed by licensed attorneys before being relied upon for legal decisions.

---

## Acknowledgments

- **Skill methodologies** by [Anthropic](https://anthropic.com/) - This wrapper would not exist without their masterfully crafted legal skills
- **Ollama** for making local LLMs accessible
- **OpenRouter** for providing access to diverse cloud models

This is a demonstration project showing how Anthropic's skills can be adapted for different use cases and model preferences.
