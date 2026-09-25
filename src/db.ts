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

// Migrations
try { db.exec(`ALTER TABLE features ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE features ADD COLUMN docs_url TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE features ADD COLUMN newsletter_month TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE features ADD COLUMN newsletter_priority INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE features ADD COLUMN flags_override TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE releases ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE releases ADD COLUMN repo TEXT NOT NULL DEFAULT 'hitpay-core'`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE features ADD COLUMN platform TEXT NOT NULL DEFAULT 'web'`); } catch { /* already exists */ }

// Pseudo-release satisfying the FK for manually-added features (not tied to a GitHub release)
db.prepare(`
  INSERT OR IGNORE INTO releases (tag, published_at, analyzed_at, is_hidden)
  VALUES ('manual', NULL, NULL, 1)
`).run();

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
  docs_url: string | null;
  newsletter_month: string | null;
  newsletter_priority: number;
  flags_override: string | null;
  platform: string;
}

export interface Release {
  tag: string;
  published_at: string;
  analyzed_at: string;
  is_hidden: number;
  repo: string;
  feature_count?: number;
  selected_count?: number;
}

export const queries = {
  upsertRelease: db.prepare(`
    INSERT INTO releases (tag, published_at, analyzed_at, repo)
    VALUES (@tag, @published_at, @analyzed_at, @repo)
    ON CONFLICT(tag) DO UPDATE SET analyzed_at=excluded.analyzed_at, repo=excluded.repo
  `),

  insertFeature: db.prepare(`
    INSERT INTO features (release_tag, product_area, title, description, is_selected, priority, platform)
    VALUES (@release_tag, @product_area, @title, @description, 0, @priority, @platform)
  `),

  getReleaseByTag: db.prepare(`SELECT * FROM releases WHERE tag = ?`),

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

  updateReleaseHidden: db.prepare(`UPDATE releases SET is_hidden = @is_hidden WHERE tag = @tag`),

  getFeatureById: db.prepare(`SELECT * FROM features WHERE id = ?`),

  getMonths: db.prepare(`
    SELECT
      strftime('%Y-%m', r.published_at) as month_key,
      COUNT(DISTINCT r.tag) as release_count,
      COUNT(f.id) as feature_count,
      COALESCE(SUM(f.is_selected), 0) as selected_count
    FROM releases r
    LEFT JOIN features f ON f.release_tag = r.tag
    GROUP BY month_key
    ORDER BY month_key DESC
  `),

  getFeaturesByMonth: db.prepare(`
    SELECT f.* FROM features f
    JOIN releases r ON r.tag = f.release_tag
    WHERE strftime('%Y-%m', r.published_at) = ?
    ORDER BY r.published_at DESC, f.product_area, f.priority, f.id
  `),

  getSelectedFeaturesByMonth: db.prepare(`
    SELECT f.* FROM features f
    JOIN releases r ON r.tag = f.release_tag
    WHERE strftime('%Y-%m', r.published_at) = ? AND f.is_selected = 1 AND f.is_hidden = 0
    ORDER BY f.priority, f.id
  `),

  selectAllByMonth: db.prepare(`
    UPDATE features SET is_selected = 1
    WHERE release_tag IN (SELECT tag FROM releases WHERE strftime('%Y-%m', published_at) = ?)
    AND is_hidden = 0
  `),

  deselectAllByMonth: db.prepare(`
    UPDATE features SET is_selected = 0
    WHERE release_tag IN (SELECT tag FROM releases WHERE strftime('%Y-%m', published_at) = ?)
  `),

  // Newsletter queries
  getNewsletterMonths: db.prepare(`
    SELECT
      newsletter_month,
      COUNT(*) as feature_count
    FROM features
    WHERE newsletter_month IS NOT NULL
    GROUP BY newsletter_month
    ORDER BY newsletter_month DESC
  `),

  getFeaturesByNewsletterMonth: db.prepare(`
    SELECT * FROM features
    WHERE newsletter_month = ?
    ORDER BY newsletter_priority, id
  `),

  getMaxNewsletterPriority: db.prepare(`
    SELECT COALESCE(MAX(newsletter_priority), -10) as max_priority FROM features WHERE newsletter_month = ?
  `),

  insertManualFeature: db.prepare(`
    INSERT INTO features (release_tag, product_area, title, description, is_selected, priority, newsletter_month, newsletter_priority, platform)
    VALUES ('manual', @product_area, @title, @description, 1, 0, @newsletter_month, @newsletter_priority, @platform)
  `),

  updatePlatform: db.prepare(`UPDATE features SET platform = @platform WHERE id = @id`),

  assignFeatureToNewsletter: db.prepare(`
    UPDATE features SET newsletter_month = @newsletter_month WHERE id = @id
  `),

  unassignFeatureFromNewsletter: db.prepare(`
    UPDATE features SET newsletter_month = NULL WHERE id = @id
  `),

  updateNewsletterPriority: db.prepare(`
    UPDATE features SET newsletter_priority = @priority WHERE id = @id
  `),

  updateFlagsOverride: db.prepare(`UPDATE features SET flags_override = @flags_override WHERE id = @id`),
};
