import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appConfig } from '../config/index.js';
import { router } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
const publicDir = join(__dirname, '../../public');
app.use(express.static(publicDir));

// API Routes
app.use('/api', router);

// Uploads directory
export const uploadsDir = join(__dirname, '../../uploads');

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${publicDir}`);
    console.log(`🔌 MCP Server Port: ${appConfig.mcp.serverPort}`);
    console.log(`🤖 AI Model: ${appConfig.ai.model}`);
});
