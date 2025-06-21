import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { pipeline, RawImage, env } from '@huggingface/transformers';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Configure transformers.js to use local models
env.allowLocalModels = true;
env.useFSCache = false;

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/masks', express.static(path.join(__dirname, '..', 'public', 'masks')));

const upload = multer({ storage: multer.memoryStorage() });

// Ensure the masks directory exists
const masksDir = path.join(__dirname, '..', 'public', 'masks');
if (!fs.existsSync(masksDir)) {
    fs.mkdirSync(masksDir, { recursive: true });
}

app.post('/api/detect', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    try {
        const modelPath = path.join(__dirname, '..', 'public', 'outdoorfloorai');
        const detector = await pipeline('image-segmentation', modelPath);

        const imageBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
        const image = await RawImage.read(imageBlob);
        const segmentation = await detector(image);

        const { width, height } = image;

        const floorMasks = segmentation.filter(item => item.label === 'road' || item.label === 'sidewalk');

        if (floorMasks.length === 0) {
            return res.status(404).json({ error: 'No floor detected.' });
        }

        const loadedMasks = floorMasks.map(m => m.mask);

        let combinedMask = sharp({
            create: {
                width,
                height,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
        });

        const compositeOperations: sharp.OverlayOptions[] = loadedMasks.map(mask => {
            // Convert the 1-channel grayscale mask to a 4-channel RGBA image (white on transparent)
            const rgbaMask = Buffer.alloc(width * height * 4);
            for (let i = 0; i < mask.data.length; i++) {
                const value = mask.data[i];
                if (value > 0) {
                    rgbaMask[i * 4] = 255;     // R
                    rgbaMask[i * 4 + 1] = 255; // G
                    rgbaMask[i * 4 + 2] = 255; // B
                    rgbaMask[i * 4 + 3] = 255; // A
                }
            }
            return {
                input: rgbaMask,
                raw: { width, height, channels: 4 },
                blend: 'add'
            };
        });

        combinedMask = combinedMask.composite(compositeOperations);

        const maskFileName = `${uuidv4()}.png`;
        const maskPath = path.join(masksDir, maskFileName);

        await combinedMask.png().toFile(maskPath);

        res.json({ maskUrl: `/masks/${maskFileName}` });

    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: 'Failed to process image.' });
    }
});

app.options('/api/delete-mask', cors()); // enable pre-flight request for DELETE request
app.post('/api/delete-mask', (req, res) => {
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).json({ error: 'Filename is required.' });
    }

    const maskPath = path.join(masksDir, filename);

    // Basic security check to prevent path traversal
    if (path.dirname(maskPath) !== masksDir) {
        return res.status(400).json({ error: 'Invalid filename.' });
    }

    fs.unlink(maskPath, (err) => {
        if (err) {
            // It's okay if the file doesn't exist (e.g., already deleted)
            if (err.code === 'ENOENT') {
                return res.status(200).json({ message: 'Mask already deleted or does not exist.' });
            }
            console.error('Error deleting mask:', err);
            return res.status(500).json({ error: 'Failed to delete mask.' });
        }
        res.status(200).json({ message: 'Mask deleted successfully.' });
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${port}`);
});
