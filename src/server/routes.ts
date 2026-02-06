import { Router } from 'express';
import multer from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { reviewContract, triageNda, generateBrief } from '../cli/commands/index.js';
import { appConfig } from '../config/index.js';

// Setup uploads storage configuration
const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Keep original name but prepend timestamp to avoid collisions
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });
export const router = Router();

// --- API Endpoints ---

// 1. Contract Review
router.post('/review', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No document file uploaded' });
            return;
        }

        const { side, focus } = req.body;
        const focusAreas = focus ? focus.split(',').map((s: string) => s.trim()) : [];

        // Call existing logic
        const analysis = await reviewContract(req.file.path, {
            side: side as 'vendor' | 'customer',
            focusAreas
        });

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Review error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 2. NDA Triage
router.post('/triage', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No document file uploaded' });
            return;
        }

        const analysis = await triageNda(req.file.path);
        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Triage error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 3. Legal Brief
router.post('/brief', async (req, res) => {
    try {
        const { type, query } = req.body;

        if (!type || !query) {
            res.status(400).json({ error: 'Missing type or query' });
            return;
        }

        const analysis = await generateBrief(type as 'topic' | 'incident', query);
        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Brief error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 4. Configuration Info
router.get('/config', (req, res) => {
    res.json({
        aiModel: appConfig.ai.model,
        aiBaseUrl: appConfig.ai.baseUrl,
        aiProvider: appConfig.ai.provider
    });
});
