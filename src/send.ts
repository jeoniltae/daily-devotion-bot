// 매일 묵상글 1편을 텔레그램 채널로 발송하는 진입점
// 현재는 checklist.md 의 STEP 5 — 선택·조립·발송까지. 시트 되쓰기는 STEP 6 에서 붙인다.

import { buildMessage } from './message.ts';
import { readDevotions, type Devotion } from './sheets.ts';
import { sendMessage } from './telegram.ts';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`환경변수 ${name} 가 비어 있다.`);
  }
  return value.trim();
};

// status 빈 값은 '대기'로 간주한다. (CLAUDE.md 4장)
const isWaiting = (devotion: Devotion): boolean => devotion.status === '' || devotion.status === '대기';

const main = async (): Promise<void> => {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const chatId = requireEnv('TELEGRAM_CHANNEL_ID');
  const spreadsheetId = requireEnv('GOOGLE_SHEET_ID');

  const devotions = await readDevotions(spreadsheetId);
  const waiting = devotions.filter(isWaiting).sort((a, b) => a.id - b.id);
  console.log(`전체 ${devotions.length}편 중 대기 ${waiting.length}편`);

  const next = waiting[0];
  if (next === undefined) {
    // 콘텐츠 고갈. 사람이 채워 넣어야 하므로 알린다. (checklist.md 결정 1)
    throw new Error('발송할 대기 글이 없다. 시트에 묵상글을 추가해야 한다.');
  }

  if (next.body === '') {
    // 빈 글이 채널에 나가는 사고를 막는다. (CLAUDE.md 5장)
    throw new Error(`${next.rowNumber}행(id=${next.id}) 의 body 가 비어 있어 발송하지 않는다.`);
  }

  const text = buildMessage(next);
  console.log(`선택 — id=${next.id}, ${next.rowNumber}행, 조립 ${text.length}자`);

  await sendMessage({ token, chatId, text, parseMode: 'HTML' });
  console.log(`발송 성공 — id=${next.id}`);
};

try {
  await main();
} catch (error) {
  // 사람이 개입해야 하는 상황이므로 잡을 실패시킨다. (checklist.md 결정 1)
  console.error(`실패 — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
