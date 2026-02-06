import { Router } from 'express';
import multer from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { reviewContract, triageNda, generateBrief, checkCompliance, assessRisk, summarizeMeeting } from '../cli/commands/index.js';
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

        const { side, focus, model, replyInOriginalLanguage } = req.body;
        const focusAreas = focus ? focus.split(',').map((s: string) => s.trim()) : [];

        // Call existing logic
        const analysis = await reviewContract(req.file.path, {
            side: side as 'vendor' | 'customer',
            focusAreas,
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage === 'true' || replyInOriginalLanguage === true
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

        const { model, replyInOriginalLanguage } = req.body;
        const analysis = await triageNda(req.file.path, {
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage === 'true' || replyInOriginalLanguage === true
        });
        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Triage error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 3. Legal Brief
router.post('/brief', async (req, res) => {
    try {
        const { type, query, model, replyInOriginalLanguage } = req.body;

        if (!type || !query) {
            res.status(400).json({ error: 'Missing type or query' });
            return;
        }

        const analysis = await generateBrief(type as 'topic' | 'incident', query, {
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage // JSON body handles booleans correctly
        });
        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Brief error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 4. Compliance
router.post('/compliance', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No document file uploaded' });
            return;
        }
        const { model, replyInOriginalLanguage } = req.body;
        const result = await checkCompliance(req.file.path, {
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage === 'true' || replyInOriginalLanguage === true
        });
        res.json({ success: true, analysis: result });
    } catch (error) {
        console.error('Compliance error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 5. Risk Assessment
router.post('/risk', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No document file uploaded' });
            return;
        }
        const { model, replyInOriginalLanguage } = req.body;
        const result = await assessRisk(req.file.path, {
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage === 'true' || replyInOriginalLanguage === true
        });
        res.json({ success: true, analysis: result });
    } catch (error) {
        console.error('Risk error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 6. Meeting Brief
router.post('/meeting', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No document file uploaded' });
            return;
        }
        const { model, replyInOriginalLanguage } = req.body;
        const result = await summarizeMeeting(req.file.path, {
            model: model as string,
            replyInOriginalLanguage: replyInOriginalLanguage === 'true' || replyInOriginalLanguage === true
        });
        res.json({ success: true, analysis: result });
    } catch (error) {
        console.error('Meeting error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// 7. Configuration Info
router.get('/config', (req, res) => {
    res.json({
        aiModel: appConfig.ai.model,
        aiBaseUrl: (appConfig.ai as any).baseUrl,
        aiProvider: appConfig.ai.provider
    });
});
