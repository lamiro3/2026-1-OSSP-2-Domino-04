'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('../config/db');

const CSV_PATH = path.join(__dirname, '../../data/kpop_locations.csv');

const CATEGORY_MAP = {
  'cafe': 'CAFE',
  'restaurant': 'RESTAURANT',
  'playground': 'PLAYGROUND',
  'store': 'STORE',
  'shop': 'SHOP',
  'stay': 'ACCOMMODATION',
};

function readCSV() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function seed() {
  const [[{ count }]] = await db.execute(
    "SELECT COUNT(*) as count FROM KpopLocations WHERE source_type = 'CSV'"
  );
  if (count > 0) {
    console.log(`이미 ${count}건의 CSV 데이터가 존재합니다. 시드를 건너뜁니다.`);
    process.exit(0);
  }

  const rows = await readCSV();
  const targets = rows.filter(
    row => row['미디어타입'] === 'artist' && row['주소'].includes('서울')
  );
  console.log(`총 ${targets.length}건 처리 시작`);

  let success = 0;
  for (const row of targets) {
    const artistName = row['제목'];
    const locationName = row['장소명'];
    const category = CATEGORY_MAP[(row['장소타입'] || '').toLowerCase()] || 'ATTRACTION';
    const description = row['장소설명'] || null;
    const lat = parseFloat(row['위도']);
    const lng = parseFloat(row['경도']);

    // 1. Places INSERT
    const [placeResult] = await db.execute(
      `INSERT INTO Places (category, place_id, coordinates, source, createdAt, updatedAt)
       VALUES (?, NULL, ST_GeomFromText(?, 4326), 'CSV', NOW(), NOW())`,
      [category, `POINT(${lng} ${lat})`]
    );
    const placeId = placeResult.insertId;

    // 2. Artists INSERT IGNORE (name UNIQUE 제약으로 중복 방지)
    await db.execute(
      `INSERT IGNORE INTO Artists (name, created_at, updated_at) VALUES (?, NOW(), NOW())`,
      [artistName]
    );
    const [[artist]] = await db.execute(
      `SELECT id FROM Artists WHERE name = ?`,
      [artistName]
    );

    // 3. KpopLocations INSERT
    await db.execute(
      `INSERT INTO KpopLocations (artist_id, place_id, location_name, media_title, description, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'CSV', NOW(), NOW())`,
      [artist.id, placeId, locationName, artistName, description]
    );

    success++;
  }

  console.log(`시드 완료: ${success}건 삽입`);
  process.exit(0);
}

seed().catch(err => {
  console.error('시드 실패:', err);
  process.exit(1);
});