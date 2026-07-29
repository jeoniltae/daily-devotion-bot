// 매일 묵상글 1편을 텔레그램 채널로 발송하는 진입점
// 현재는 checklist.md 의 STEP 4 — 시트 읽기만 검증한다. 발송은 STEP 5 에서 다시 붙인다.

import { readDevotions } from './sheets.ts';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`환경변수 ${name} 가 비어 있다.`);
  }
  return value.trim();
};

const main = async (): Promise<void> => {
  const spreadsheetId = requireEnv('GOOGLE_SHEET_ID');

  const devotions = await readDevotions(spreadsheetId);
  console.log(`읽어온 묵상글: ${devotions.length}편`);

  const waiting = devotions.filter((devotion) => devotion.status === '' || devotion.status === '대기');
  console.log(`발송 대기: ${waiting.length}편`);

  const first = [...devotions].sort((a, b) => a.id - b.id)[0];
  if (first === undefined) {
    console.log('읽어온 행이 없다.');
    return;
  }

  console.log('\n--- id 가 가장 작은 행 ---');
  console.log(`행번호   : ${first.rowNumber}`);
  console.log(`id       : ${first.id}`);
  console.log(`title    : ${first.title || '(빈 값)'}`);
  console.log(`verseRef : ${first.verseRef || '(빈 값)'}`);
  console.log(`verseText: ${first.verseText || '(빈 값)'}`);
  console.log(`body     : ${first.body || '(빈 값)'}`);
  console.log(`source   : ${first.source || '(빈 값)'}`);
  console.log(`status   : ${first.status || '(빈 값 = 대기)'}`);
  console.log(`sentAt   : ${first.sentAt || '(빈 값)'}`);
};

try {
  await main();
} catch (error) {
  // 사람이 개입해야 하는 상황이므로 잡을 실패시킨다. (checklist.md 결정 1)
  console.error(`실패 — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
