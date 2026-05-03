/**
 * One-shot data fix: reapplies the corrections that the May-2 commit
 * (fc2f1cb "Fix Cole's James Wood and 4 spelling typos") only landed
 * in seed.ts but never wrote to the committed baseball.db. CI's daily
 * sync has been silently re-emitting the bug ever since.
 *
 * Idempotent — safe to re-run.
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'baseball.db'));

const tx = db.transaction(() => {
  // --- Cole's James Wood: routing fix ---
  // id=4 is Cole's draft slot, currently pointed at mlb_id 694497 (Evan Carter).
  // id=143 is the auto-discovered real Wood (mlb_id 695578).
  // Goal: keep id=4 (so we don't break any external references), repoint it at
  // 695578, move the real Wood's stats onto it, drop the bogus id=4 rows and
  // the orphan id=143.
  const woodSlot = db.prepare(
    `SELECT id, mlb_id FROM players WHERE id=4`
  ).get() as { id: number; mlb_id: number } | undefined;
  const orphanWood = db.prepare(
    `SELECT id FROM players WHERE mlb_id=695578 AND id != 4`
  ).get() as { id: number } | undefined;

  if (woodSlot && woodSlot.mlb_id === 694497) {
    // Carter's bogus daily lines that have been attributed to Cole all season
    const deleted = db.prepare(`DELETE FROM daily_stats WHERE player_id=4`).run();
    console.log(`Cole's Wood slot: deleted ${deleted.changes} bogus daily_stats rows`);

    if (orphanWood) {
      const moved = db.prepare(
        `UPDATE daily_stats SET player_id=4 WHERE player_id=?`
      ).run(orphanWood.id);
      console.log(`Moved ${moved.changes} real Wood daily_stats rows from id=${orphanWood.id} → id=4`);
    }

    // Drop the orphan row before repointing id=4, so the UNIQUE(mlb_id) on
    // players doesn't fire when we move id=4 to 695578.
    if (orphanWood) {
      db.prepare(`DELETE FROM players WHERE id=?`).run(orphanWood.id);
      console.log(`Removed orphan player row id=${orphanWood.id}`);
    }

    db.prepare(
      `UPDATE players SET mlb_id=695578, mlb_team='WSH', position='RF' WHERE id=4`
    ).run();
    console.log(`Repointed id=4 → mlb_id 695578 (real James Wood, WSH RF)`);
  } else if (woodSlot && woodSlot.mlb_id === 695578) {
    console.log(`Cole's Wood already correct (mlb_id 695578) — skipping routing fix`);
  } else {
    console.log(`Unexpected Wood slot state: id=4 mlb_id=${woodSlot?.mlb_id} — skipping`);
  }

  // --- Name spellings: drafted players where stored name disagrees with MLB API ---
  const nameFixes: Array<[number, string]> = [
    [575929, 'Willson Contreras'],   // was 'Wilson Contreras'
    [673237, 'Yainer Diaz'],         // was 'Yanier Diaz'
    [678882, 'Ceddanne Rafaela'],    // was 'Cedanne Rafaela'
    [682663, 'Agustín Ramírez'],     // was 'Augustin Ramirez'
    [682818, 'Yohendrick Piñango'],  // was 'Yohendrick Pinango' (undrafted)
  ];
  const updateName = db.prepare(`UPDATE players SET name=? WHERE mlb_id=? AND name != ?`);
  for (const [mlbId, name] of nameFixes) {
    const r = updateName.run(name, mlbId, name);
    if (r.changes > 0) console.log(`Renamed mlb_id ${mlbId} → "${name}"`);
  }
});

tx();
db.close();
console.log('Done.');
