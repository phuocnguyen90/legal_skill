#!/usr/bin/env node
import { Command } from 'commander';
import { reviewContract, triageNda, generateBrief } from './commands/index.js';
import { appConfig } from '../config/index.js';

const program = new Command();

program
    .name('legal-skill')
    .description('Ollama-powered legal skills for contract review, NDA triage, and legal briefings')
    .version('1.0.0');

program
    .command('review <file>')
    .description('Review a contract against your organization\'s playbook')
    .option('-s, --side <side>', 'Your side in the agreement (vendor or customer)', 'customer')
    .option('-f, --focus <areas>', 'Comma-separated focus areas (e.g., liability,data-protection)')
    .option('-m, --model <model>', 'Ollama model to use', appConfig.ollama.model)
    .action(async (file, options) => {
        try {
            console.log(`\n📄 Reviewing contract: ${file}`);
            console.log(`   Model: ${options.model}`);
            console.log(`   Side: ${options.side}`);
            if (options.focus) {
                console.log(`   Focus: ${options.focus}`);
            }
            console.log('\n---\n');

            const result = await reviewContract(file, {
                side: options.side as 'vendor' | 'customer',
                focusAreas: options.focus?.split(',').map((s: string) => s.trim()),
            });

            console.log(result);
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

program
    .command('triage <file>')
    .description('Triage an NDA for quick classification')
    .option('-m, --model <model>', 'Ollama model to use', appConfig.ollama.model)
    .action(async (file, options) => {
        try {
            console.log(`\n📋 Triaging NDA: ${file}`);
            console.log(`   Model: ${options.model}`);
            console.log('\n---\n');

            const result = await triageNda(file);
            console.log(result);
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

program
    .command('brief <type> [query]')
    .description('Generate a legal brief (topic or incident)')
    .option('-m, --model <model>', 'Ollama model to use', appConfig.ollama.model)
    .action(async (type, query, options) => {
        if (type !== 'topic' && type !== 'incident') {
            console.error('Error: Brief type must be "topic" or "incident"');
            process.exit(1);
        }

        if (!query) {
            console.error('Error: Please provide a query for the brief');
            process.exit(1);
        }

        try {
            console.log(`\n📝 Generating ${type} brief`);
            console.log(`   Model: ${options.model}`);
            console.log(`   Query: ${query}`);
            console.log('\n---\n');

            const result = await generateBrief(type, query);
            console.log(result);
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

program
    .command('mcp-server')
    .description('Start the MCP document server for external use')
    .action(async () => {
        console.log('Starting MCP Document Server...');
        console.log('Use Ctrl+C to stop.');

        // Dynamic import to start the server
        await import('../mcp/document-server.js');
    });

program
    .command('serve')
    .description('Start the Web UI Server')
    .action(async () => {
        // Dynamic import to start the server
        await import('../server/index.js');
    });

program
    .command('config')
    .description('Show current configuration')
    .action(() => {
        console.log('\n⚙️  Current Configuration:\n');
        console.log(`Ollama URL: ${appConfig.ollama.baseUrl}`);
        console.log(`Model: ${appConfig.ollama.model}`);
        console.log(`MCP Server Port: ${appConfig.mcp.serverPort}`);
        console.log(`Playbook Path: ${appConfig.playbook.path || '(not configured)'}`);
        console.log('\nSet these via environment variables or .env file.');
    });

program.parse();
