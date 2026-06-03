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

function fmtMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// GET /api/months
app.get('/api/months', (_req, res) => {
  res.json(queries.getMonths.all());
});

// GET /api/months/:monthKey/features
app.get('/api/months/:monthKey/features', (req, res) => {
  const { monthKey } = req.params;
  const raw = queries.getFeaturesByMonth.all(monthKey) as Feature[];
  const features = raw.map(f => ({
    ...f,
    has_image: featureImagePath(f.release_tag, f.id) !== null,
  }));
  const grouped: Record<string, typeof features> = {};
  for (const f of features) {
    if (!grouped[f.product_area]) grouped[f.product_area] = [];
    grouped[f.product_area].push(f);
  }
  res.json({ features, grouped });
});

// POST /api/months/:monthKey/select-all
app.post('/api/months/:monthKey/select-all', (req, res) => {
  queries.selectAllByMonth.run(req.params.monthKey);
  res.json({ ok: true });
});

// POST /api/months/:monthKey/deselect-all
app.post('/api/months/:monthKey/deselect-all', (req, res) => {
  queries.deselectAllByMonth.run(req.params.monthKey);
  res.json({ ok: true });
});

// POST /api/months/:monthKey/enrich  { featureIds: number[] }
app.post('/api/months/:monthKey/enrich', async (req, res) => {
  const { monthKey } = req.params;
  const { featureIds } = req.body as { featureIds: number[] };
  if (!featureIds?.length) { res.status(400).json({ error: 'No feature IDs provided' }); return; }

  try {
    const { fetchReleasePRs, enrichFeatures, applyEnrichedDescriptions } = await import('./enrich-utils');
    const allMonthFeatures = queries.getFeaturesByMonth.all(monthKey) as Feature[];
    const features = allMonthFeatures.filter(f => featureIds.includes(f.id));

    const byTag: Record<string, Feature[]> = {};
    for (const f of features) {
      if (!byTag[f.release_tag]) byTag[f.release_tag] = [];
      byTag[f.release_tag].push(f);
    }

    const allEnriched: { id: number }[] = [];
    for (const [tag, tagFeatures] of Object.entries(byTag)) {
      const prs = await fetchReleasePRs(tag);
      const enriched = await enrichFeatures(tagFeatures, prs);
      applyEnrichedDescriptions(enriched);
      allEnriched.push(...enriched);
    }

    const updated = queries.getFeaturesByMonth.all(monthKey) as Feature[];
    const updatedMap = Object.fromEntries(updated.map(f => [f.id, f]));
    res.json({ ok: true, updated: allEnriched.map(e => updatedMap[e.id]).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/months/:monthKey/generate
app.post('/api/months/:monthKey/generate', async (req, res) => {
  const { monthKey } = req.params;
  const { orderedIds } = req.body as { orderedIds?: number[] };

  let selected = queries.getSelectedFeaturesByMonth.all(monthKey) as Feature[];

  if (orderedIds?.length) {
    const featMap = new Map(selected.map(f => [f.id, f]));
    selected = orderedIds.map(id => featMap.get(id)!).filter(Boolean);
  }

  if (selected.length === 0) {
    res.status(400).json({ error: 'No features selected for this month.' });
    return;
  }

  try {
    const { generateFromSelections } = await import('./generate-from-selections');
    const label = fmtMonthLabel(monthKey);
    const zipPath = await generateFromSelections(
      monthKey,
      selected.map(f => ({
        id: f.id,
        release_tag: f.release_tag,
        product_area: f.product_area,
        title: f.title,
        description: f.description,
      })),
      { label }
    );
    const filename = path.basename(zipPath);
    res.json({ ok: true, zipPath, downloadUrl: `/download/${filename}` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

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

// PATCH /api/features/:id/docs-url  { docs_url: string | null }
// 'none' = explicitly suppressed (no auto-detect); null/''/omitted = auto-detect
app.patch('/api/features/:id/docs-url', (req, res) => {
  const { docs_url } = req.body as { docs_url: string | null };
  db.prepare('UPDATE features SET docs_url = ? WHERE id = ?').run(
    docs_url === 'none' ? 'none' : (docs_url || null),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

// PATCH /api/features/:id/description  { description: string }
app.patch('/api/features/:id/description', (req, res) => {
  const { description } = req.body as { description: string };
  if (!description?.trim()) { res.status(400).json({ error: 'Description required' }); return; }
  db.prepare('UPDATE features SET description = ? WHERE id = ?').run(description.trim(), Number(req.params.id));
  res.json({ ok: true });
});

// PATCH /api/features/:id/category  { product_area: string }
app.patch('/api/features/:id/category', (req, res) => {
  const { product_area } = req.body as { product_area: string };
  db.prepare('UPDATE features SET product_area = ? WHERE id = ?').run(product_area, Number(req.params.id));
  res.json({ ok: true });
});

// PATCH /api/features/:id/month  { monthKey: string }
app.patch('/api/features/:id/month', (req, res) => {
  const { monthKey } = req.body as { monthKey: string };
  const release = db.prepare(
    `SELECT tag FROM releases WHERE strftime('%Y-%m', published_at) = ? ORDER BY published_at ASC LIMIT 1`
  ).get(monthKey) as { tag: string } | undefined;

  if (!release) {
    res.status(400).json({ error: `No releases found for ${monthKey}` });
    return;
  }

  db.prepare('UPDATE features SET release_tag = ? WHERE id = ?').run(release.tag, Number(req.params.id));
  res.json({ ok: true, release_tag: release.tag });
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

// POST /api/releases/:tag/enrich  { featureIds: number[] }
app.post('/api/releases/:tag/enrich', async (req, res) => {
  const tag = req.params.tag;
  const { featureIds } = req.body as { featureIds: number[] };
  if (!featureIds?.length) { res.status(400).json({ error: 'No feature IDs provided' }); return; }

  try {
    const { fetchReleasePRs, enrichFeatures, applyEnrichedDescriptions } = await import('./enrich-utils');
    const allFeatures = queries.getFeaturesByTag.all(tag) as Feature[];
    const features = allFeatures.filter(f => featureIds.includes(f.id));
    const prs = await fetchReleasePRs(tag);
    const enriched = await enrichFeatures(features, prs);
    applyEnrichedDescriptions(enriched);

    // Return updated features so UI can refresh without reload
    const updated = queries.getFeaturesByTag.all(tag) as Feature[];
    const updatedMap = Object.fromEntries(updated.map(f => [f.id, f]));
    res.json({ ok: true, updated: enriched.map(e => updatedMap[e.id]).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/releases/:tag/generate  → triggers ZIP generation
app.post('/api/releases/:tag/generate', async (req, res) => {
  const tag = req.params.tag;
  const { orderedIds, label } = req.body as { orderedIds?: number[]; label?: string };

  let selected = queries.getSelectedFeaturesByTag.all(tag) as Array<{
    id: number; release_tag: string; product_area: string; title: string; description: string;
  }>;

  if (orderedIds?.length) {
    const featMap = new Map(selected.map(f => [f.id, f]));
    selected = orderedIds.map(id => featMap.get(id)!).filter(Boolean);
  }

  if (selected.length === 0) {
    res.status(400).json({ error: 'No features selected for this release.' });
    return;
  }

  try {
    const { generateFromSelections } = await import('./generate-from-selections');
    const zipPath = await generateFromSelections(tag, selected, label ? { label } : undefined);
    const filename = path.basename(zipPath);
    res.json({ ok: true, zipPath, downloadUrl: `/download/${filename}` });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

// ── Newsletter endpoints ───────────────────────────────────────────────────────

// GET /api/newsletters
app.get('/api/newsletters', (_req, res) => {
  res.json(queries.getNewsletterMonths.all());
});

// GET /api/newsletters/:month/features
app.get('/api/newsletters/:month/features', (req, res) => {
  const { month } = req.params;
  const raw = queries.getFeaturesByNewsletterMonth.all(month) as Feature[];
  const features = raw.map(f => ({
    ...f,
    has_image: featureImagePath(f.release_tag, f.id) !== null,
  }));
  res.json({ features });
});

// PATCH /api/features/:id/newsletter  { newsletter_month: string | null }
app.patch('/api/features/:id/newsletter', (req, res) => {
  const { newsletter_month } = req.body as { newsletter_month: string | null };
  const id = Number(req.params.id);
  if (newsletter_month) {
    queries.assignFeatureToNewsletter.run({ newsletter_month, id });
  } else {
    queries.unassignFeatureFromNewsletter.run(id);
  }
  res.json({ ok: true });
});

// PATCH /api/features/:id/newsletter-priority  { priority: number }
app.patch('/api/features/:id/newsletter-priority', (req, res) => {
  const { priority } = req.body as { priority: number };
  queries.updateNewsletterPriority.run({ priority, id: Number(req.params.id) });
  res.json({ ok: true });
});

// POST /api/newsletters/:month/generate
app.post('/api/newsletters/:month/generate', async (req, res) => {
  const { month } = req.params;
  const { orderedIds } = req.body as { orderedIds?: number[] };

  let selected = queries.getFeaturesByNewsletterMonth.all(month) as Feature[];

  if (orderedIds?.length) {
    const featMap = new Map(selected.map(f => [f.id, f]));
    selected = orderedIds.map(id => featMap.get(id)!).filter(Boolean);
  }

  if (selected.length === 0) {
    res.status(400).json({ error: 'No features in this newsletter.' });
    return;
  }

  try {
    const { generateFromSelections } = await import('./generate-from-selections');
    const label = fmtMonthLabel(month);
    const zipPath = await generateFromSelections(
      month,
      selected.map(f => ({
        id: f.id,
        release_tag: f.release_tag,
        product_area: f.product_area,
        title: f.title,
        description: f.description,
        docs_url: f.docs_url,
      })),
      { label }
    );
    const filename = path.basename(zipPath);
    res.json({ ok: true, zipPath, downloadUrl: `/download/${filename}` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`\nHitPay EDM Selection UI → http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.\n');
  // Auto-open in browser on macOS
  require('child_process').exec(`open http://localhost:${PORT}`);
});

export default app;
