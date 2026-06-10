import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { parseOpenDrive, processRoadForFrontend, sampleReferenceLine, buildLaneBoundaries } from './opendrive/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const MAPS_DIR = path.join(__dirname, '..', 'maps');

if (!fs.existsSync(MAPS_DIR)) {
  fs.mkdirSync(MAPS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '200mb' }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAPS_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.get('/api/maps', (req, res) => {
  try {
    const files = fs.readdirSync(MAPS_DIR)
      .filter(f => f.endsWith('.xodr'))
      .map(f => {
        const stat = fs.statSync(path.join(MAPS_DIR, f));
        return {
          name: f,
          size: stat.size,
          modified: stat.mtime
        };
      });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maps/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ name: req.file.filename, size: req.file.size });
});

app.get('/api/maps/:name/parse', async (req, res) => {
  const filename = req.params.name;
  const filepath = path.join(MAPS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Map file not found' });
  }

  try {
    const buffer = fs.readFileSync(filepath);
    const parsed = await parseOpenDrive(buffer);

    const roads = parsed.roads.map(road => {
      const frontendData = processRoadForFrontend(road);
      return frontendData;
    });

    res.json({
      header: parsed.header,
      roads
    });
  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maps/:name/roads/:roadId/sample', async (req, res) => {
  const filename = req.params.name;
  const roadId = req.params.roadId;
  const filepath = path.join(MAPS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Map file not found' });
  }

  try {
    const buffer = fs.readFileSync(filepath);
    const parsed = await parseOpenDrive(buffer);
    const road = parsed.roads.find(r => r.id === roadId || String(r.id) === String(roadId));

    if (!road) {
      return res.status(404).json({ error: 'Road not found' });
    }

    const refLine = sampleReferenceLine(road, 0.25);
    const lanes = buildLaneBoundaries(road);

    res.json({
      roadId: road.id,
      length: road.length,
      referenceLine: refLine,
      lanes
    });
  } catch (err) {
    console.error('Sample error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maps/:name/sample-all', async (req, res) => {
  const filename = req.params.name;
  const filepath = path.join(MAPS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Map file not found' });
  }

  try {
    const buffer = fs.readFileSync(filepath);
    const parsed = await parseOpenDrive(buffer);

    const allRoadsData = parsed.roads.map(road => {
      const refLine = sampleReferenceLine(road, 0.25);
      const lanes = buildLaneBoundaries(road);
      return {
        roadId: road.id,
        name: road.name,
        length: road.length,
        referenceLine: refLine,
        lanes
      };
    });

    res.json({
      header: parsed.header,
      roads: allRoadsData
    });
  } catch (err) {
    console.error('Sample all error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`HDMap Annotation Backend running on http://localhost:${PORT}`);
  console.log(`Maps directory: ${MAPS_DIR}`);
});
