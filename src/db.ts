import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../data/edm.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS releases (
    tag TEXT PRIMARY KEY,
    published_at TEXT,
    analyzed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_tag TEXT NOT NULL,
    product_area TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_selected INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (release_tag) REFERENCES releases(tag)
  );
`);

// Migration: add is_hidden if not present
try { db.exec(`ALTER TABLE features ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }

export default db;

export interface Feature {
  id: number;
  release_tag: string;
  product_area: string;
  title: string;
  description: string;
  is_selected: number;
  priority: number;
  is_hidden: number;
}

export interface Release {
  tag: string;
  published_at: string;
  analyzed_at: string;
  feature_count?: number;
  selected_count?: number;
}

export const queries = {
  upsertRelease: db.prepare(`
    INSERT INTO releases (tag, published_at, analyzed_at)
    VALUES (@tag, @published_at, @analyzed_at)
    ON CONFLICT(tag) DO UPDATE SET analyzed_at=excluded.analyzed_at
  `),

  insertFeature: db.prepare(`
    INSERT INTO features (release_tag, product_area, title, description, is_selected, priority)
    VALUES (@release_tag, @product_area, @title, @description, 0, @priority)
  `),

  deleteFeaturesByTag: db.prepare(`DELETE FROM features WHERE release_tag = ?`),

  getReleases: db.prepare(`
    SELECT r.*,
      COUNT(f.id) as feature_count,
      SUM(f.is_selected) as selected_count
    FROM releases r
    LEFT JOIN features f ON f.release_tag = r.tag
    GROUP BY r.tag
    ORDER BY r.published_at DESC
  `),

  getFeaturesByTag: db.prepare(`
    SELECT * FROM features WHERE release_tag = ? ORDER BY product_area, priority, id
  `),

  getSelectedFeaturesByTag: db.prepare(`
    SELECT * FROM features WHERE release_tag = ? AND is_selected = 1 AND is_hidden = 0 ORDER BY priority, id
  `),

  updateSelection: db.prepare(`
    UPDATE features SET is_selected = @is_selected WHERE id = @id
  `),

  updatePriority: db.prepare(`
    UPDATE features SET priority = @priority WHERE id = @id
  `),

  updateHidden: db.prepare(`UPDATE features SET is_hidden = @is_hidden WHERE id = @id`),

  selectAll: db.prepare(`UPDATE features SET is_selected = 1 WHERE release_tag = ? AND is_hidden = 0`),
  deselectAll: db.prepare(`UPDATE features SET is_selected = 0 WHERE release_tag = ?`),

  releaseExists: db.prepare(`SELECT tag FROM releases WHERE tag = ?`),

  getFeatureById: db.prepare(`SELECT * FROM features WHERE id = ?`),
};
