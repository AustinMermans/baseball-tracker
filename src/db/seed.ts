import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'baseball.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mlb_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    mlb_team TEXT,
    position TEXT,
    team_id INTEGER REFERENCES teams(id),
    draft_round INTEGER,
    is_active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id) NOT NULL,
    game_date TEXT NOT NULL,
    game_pk INTEGER,
    total_bases INTEGER DEFAULT 0,
    stolen_bases INTEGER DEFAULT 0,
    walks INTEGER DEFAULT 0,
    hbp INTEGER DEFAULT 0,
    fantasy_score INTEGER DEFAULT 0,
    at_bats INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    doubles INTEGER DEFAULT 0,
    triples INTEGER DEFAULT 0,
    home_runs INTEGER DEFAULT 0,
    plate_appearances INTEGER DEFAULT 0,
    runs INTEGER DEFAULT 0,
    rbi INTEGER DEFAULT 0,
    strikeouts INTEGER DEFAULT 0,
    sac_bunts INTEGER DEFAULT 0,
    sac_flies INTEGER DEFAULT 0,
    ground_into_double_play INTEGER DEFAULT 0,
    ground_into_triple_play INTEGER DEFAULT 0,
    left_on_base INTEGER DEFAULT 0,
    ground_outs INTEGER DEFAULT 0,
    fly_outs INTEGER DEFAULT 0,
    line_outs INTEGER DEFAULT 0,
    pop_outs INTEGER DEFAULT 0,
    air_outs INTEGER DEFAULT 0,
    catchers_interference INTEGER DEFAULT 0,
    caught_stealing INTEGER DEFAULT 0,
    intentional_walks INTEGER DEFAULT 0,
    pickoffs INTEGER DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS player_date_idx ON daily_stats(player_id, game_date);
  CREATE TABLE IF NOT EXISTS team_daily_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id) NOT NULL,
    game_date TEXT NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS team_date_idx ON team_daily_scores(team_id, game_date);
  CREATE TABLE IF NOT EXISTS season_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    redraft_date TEXT
  );
  CREATE TABLE IF NOT EXISTS redraft_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER REFERENCES season_periods(id),
    team_id INTEGER REFERENCES teams(id),
    player_dropped INTEGER REFERENCES players(id),
    player_added INTEGER REFERENCES players(id),
    pick_order INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

sqlite.exec('DELETE FROM redraft_log');
sqlite.exec('DELETE FROM team_daily_scores');
sqlite.exec('DELETE FROM daily_stats');
sqlite.exec('DELETE FROM players');
sqlite.exec('DELETE FROM season_periods');
sqlite.exec('DELETE FROM teams');

const insertTeam = sqlite.prepare('INSERT INTO teams (name, owner) VALUES (?, ?)');
const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];
const teamIds: Record<string, number> = {};

for (const name of teamNames) {
  const result = insertTeam.run(name, name);
  teamIds[name] = result.lastInsertRowid as number;
}

const insertPeriod = sqlite.prepare(
  'INSERT INTO season_periods (name, start_date, end_date, redraft_date) VALUES (?, ?, ?, ?)'
);
insertPeriod.run('First Third', '2026-03-26', '2026-05-30', null);
insertPeriod.run('Second Third', '2026-05-31', '2026-07-30', '2026-05-31');
insertPeriod.run('Third Third', '2026-07-31', '2026-09-27', '2026-07-31');

const rosters: Record<string, [string, number][]> = {
  'Cole': [
    ['Shohei Ohtani', 660271],
    ['Corbin Carroll', 682998],
    ['Jackson Chourio', 694192],
    ['James Wood', 695578],
    ['Jackson Merrill', 701538],
    ['Josh Naylor', 647304],
    ['Maikel Garcia', 672580],
    ['Tyler Soderstrom', 691016],
    ['Michael Harris II', 671739],
    ['Salvador Perez', 521692],
    ['Drake Baldwin', 686948],
    ['Ozzie Albies', 645277],
    ['Jacob Wilson', 805779],
  ],
  'Markus': [
    ['Aaron Judge', 592450],
    ['Gunnar Henderson', 683002],
    ['Nick Kurtz', 701762],
    ['Zach Neto', 687263],
    ['Manny Machado', 592518],
    ['Austin Riley', 663586],
    ['Vinnie Pasquantino', 686469],
    ['Hunter Goodman', 696100],
    ['Nico Hoerner', 663538],
    ['Trevor Story', 596115],
    ['Luke Keaschall', 807712],
    ['Jakob Marsee', 805300],
    ['Yainer Diaz', 673237],
  ],
  'J Mill': [
    ['Juan Soto', 665742],
    ['Fernando Tatis Jr.', 665487],
    ['Francisco Lindor', 596019],
    ['Brent Rooker', 667670],
    ['CJ Abrams', 682928],
    ['Byron Buxton', 621439],
    ['Eugenio Suarez', 553993],
    ['Will Smith', 669257],
    ['Luis Robert Jr.', 673357],
    ['Dansby Swanson', 621020],
    ['Ian Happ', 664023],
    ['Willson Contreras', 575929],
    ['Jeff McNeil', 643446],
  ],
  'Ryan': [
    ['Bobby Witt Jr.', 677951],
    ['Cal Raleigh', 663728],
    ['Pete Alonso', 624413],
    ['Mookie Betts', 605141],
    ['Rafael Devers', 646240],
    ['Bo Bichette', 666182],
    ['Seiya Suzuki', 673548],
    ['Andy Pages', 681624],
    ['Michael Busch', 683737],
    ['Bryan Reynolds', 668804],
    ['Konnor Griffin', 804606],
    ['Jung Hoo Lee', 808982],
    ['Jac Caglianone', 695506],
  ],
  'Joey': [
    ['Jose Ramirez', 608070],
    ['Kyle Tucker', 663656],
    ['Pete Crow-Armstrong', 691718],
    ['Freddie Freeman', 518692],
    ['Matt Olson', 621566],
    ['William Contreras', 661388],
    ['Cody Bellinger', 641355],
    ['Teoscar Hernandez', 606192],
    ['Yandy Diaz', 650490],
    ['Christian Yelich', 592885],
    ['Brandon Nimmo', 607043],
    ['Matt Chapman', 656305],
    ['Kyle Stowers', 669065],
  ],
  'Jack': [
    ['Ronald Acuna Jr.', 660670],
    ['Junior Caminero', 691406],
    ['Ketel Marte', 606466],
    ['Trea Turner', 607208],
    ['Roman Anthony', 701350],
    ['Riley Greene', 682985],
    ['Randy Arozarena', 668227],
    ['Willy Adames', 642715],
    ['Lawrence Butler', 671732],
    ['Steven Kwan', 680757],
    ['Ceddanne Rafaela', 678882],
    ['Luis Arraez', 650333],
    ['Heliot Ramos', 671218],
  ],
  'Austin': [
    ['Kyle Schwarber', 656941],
    ['Elly De La Cruz', 682829],
    ['Wyatt Langford', 694671],
    ['Bryce Harper', 547180],
    ['George Springer', 543807],
    ['Oneil Cruz', 665833],
    ['Corey Seager', 608369],
    ['Alex Bregman', 608324],
    ['Brenton Doyle', 686668],
    ['Jo Adell', 666176],
    ['Munetaka Murakami', 808959],
    ['Adley Rutschman', 668939],
    ['Matt McLain', 680574],
  ],
  'Bobby': [
    ['Julio Rodriguez', 677594],
    ['Vladimir Guerrero Jr.', 665489],
    ['Yordan Alvarez', 670541],
    ['Jazz Chisholm Jr.', 665862],
    ['Brice Turang', 668930],
    ['Jarren Duran', 680776],
    ['Geraldo Perdomo', 672695],
    ['Shea Langeliers', 669127],
    ['Jeremy Pena', 665161],
    ['Jose Altuve', 514888],
    ['Agustín Ramírez', 682663],
    ['Taylor Ward', 621493],
    ['Spencer Torkelson', 679529],
  ],
};

const insertPlayer = sqlite.prepare(
  'INSERT INTO players (mlb_id, name, team_id, draft_round) VALUES (?, ?, ?, ?)'
);

const insertAll = sqlite.transaction(() => {
  for (const [teamName, roster] of Object.entries(rosters)) {
    const teamId = teamIds[teamName];
    roster.forEach(([playerName, mlbId], index) => {
      insertPlayer.run(mlbId, playerName, teamId, index + 1);
    });
  }
});

insertAll();

console.log('Database seeded successfully!');
console.log(`Teams: ${Object.keys(teamIds).length}`);
console.log(`Players: ${Object.values(rosters).flat().length}`);
sqlite.close();
