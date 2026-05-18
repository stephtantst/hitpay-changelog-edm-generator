import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

import db, { queries, Feature } from './db';

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

function featureImagePath(tag: string, featureId: number): string | null {
  const dir = path.join(SCREENSHOTS_DIR, tag);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(dir, `feature-${featureId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// GET /api/releases
app.get('/api/releases', (_req, res) => {
  res.json(queries.getReleases.all());
});

// GET /api/releases/:tag/features
app.get('/api/releases/:tag/features', (req, res) => {
  const tag = req.params.tag;
  const raw = queries.getFeaturesByTag.all(tag) as Feature[];
  const features = raw.map(f => ({
    ...f,
    has_image: featureImagePath(tag, f.id) !== null,
  }));
  const grouped: Record<string, typeof features> = {};
  for (const f of features) {
    if (!grouped[f.product_area]) grouped[f.product_area] = [];
    grouped[f.product_area].push(f);
  }
  res.json({ features, grouped });
});

// GET /api/features/:id/image — serve the image file
app.get('/api/features/:id/image', (req, res) => {
  const feat = queries.getFeatureById.get(Number(req.params.id)) as Feature | undefined;
  if (!feat) { res.status(404).end(); return; }
  const imgPath = featureImagePath(feat.release_tag, feat.id);
  if (!imgPath) { res.status(404).end(); return; }
  res.sendFile(imgPath);
});

// POST /api/features/:id/image — save base64 image from browser
app.post('/api/features/:id/image', (req, res) => {
  const feat = queries.getFeatureById.get(Number(req.params.id)) as Feature | undefined;
  if (!feat) { res.status(404).json({ error: 'Feature not found' }); return; }
  const { data, mime } = req.body as { data: string; mime: string };
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
  const dir = path.join(SCREENSHOTS_DIR, feat.release_tag);
  fs.mkdirSync(dir, { recursive: true });
  // Remove any existing image for this feature
  for (const e of ['png', 'jpg', 'jpeg', 'webp']) {
    const old = path.join(dir, `feature-${feat.id}.${e}`);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  fs.writeFileSync(path.join(dir, `feature-${feat.id}.${ext}`), Buffer.from(data, 'base64'));
  res.json({ ok: true });
});

// DELETE /api/features/:id/image
app.delete('/api/features/:id/image', (req, res) => {
  const feat = queries.getFeatureById.get(Number(req.params.id)) as Feature | undefined;
  if (!feat) { res.status(404).json({ error: 'Feature not found' }); return; }
  for (const e of ['png', 'jpg', 'jpeg', 'webp']) {
    const p = path.join(SCREENSHOTS_DIR, feat.release_tag, `feature-${feat.id}.${e}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  res.json({ ok: true });
});

// PATCH /api/features/:id  { is_selected: 0|1 }
app.patch('/api/features/:id', (req, res) => {
  const { is_selected } = req.body as { is_selected: number };
  queries.updateSelection.run({ id: Number(req.params.id), is_selected });
  res.json({ ok: true });
});

// PATCH /api/features/:id/hidden  { is_hidden: 0|1 }
app.patch('/api/features/:id/hidden', (req, res) => {
  const { is_hidden } = req.body as { is_hidden: number };
  queries.updateHidden.run({ id: Number(req.params.id), is_hidden });
  res.json({ ok: true });
});

// PATCH /api/features/:id/priority  { priority: number }
app.patch('/api/features/:id/priority', (req, res) => {
  const { priority } = req.body as { priority: number };
  queries.updatePriority.run({ id: Number(req.params.id), priority });
  res.json({ ok: true });
});

// POST /api/releases/:tag/select-all
app.post('/api/releases/:tag/select-all', (req, res) => {
  queries.selectAll.run(req.params.tag);
  res.json({ ok: true });
});

// POST /api/releases/:tag/deselect-all
app.post('/api/releases/:tag/deselect-all', (req, res) => {
  queries.deselectAll.run(req.params.tag);
  res.json({ ok: true });
});

// POST /api/releases/:tag/generate  → triggers ZIP generation
app.post('/api/releases/:tag/generate', async (req, res) => {
  const tag = req.params.tag;
  const selected = queries.getSelectedFeaturesByTag.all(tag) as Array<{
    id: number; product_area: string; title: string; description: string;
  }>;

  if (selected.length === 0) {
    res.status(400).json({ error: 'No features selected for this release.' });
    return;
  }

  try {
    const { generateFromSelections } = await import('./generate-from-selections');
    const zipPath = await generateFromSelections(tag, selected);
    const filename = path.basename(zipPath);
    res.json({ ok: true, zipPath, downloadUrl: `/download/${filename}` });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

// GET /download/:filename  → serves a ZIP from output/
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(__dirname, '../output', filename);
  res.download(filePath, filename, err => {
    if (err) res.status(404).json({ error: 'File not found' });
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\nHitPay EDM Selection UI → http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.\n');
  // Auto-open in browser on macOS
  require('child_process').exec(`open http://localhost:${PORT}`);
});

export default app;
