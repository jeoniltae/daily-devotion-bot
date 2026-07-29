// 매일 묵상글 1편을 텔레그램 채널로 발송하는 진입점
// 선택 → 조립 → 발송 → 시트 갱신까지. checklist.md 의 STEP 6.

import { buildMessage } from './message.ts';
import { markSent, readDevotions, SENT_STATUS, type Devotion } from './sheets.ts';
import { sendMessage } from './telegram.ts';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`환경변수 ${name} 가 비어 있다.`);
  }
  return value.trim();
};

// status 빈 값은 '대기'로 간주한다. (CLAUDE.md 4장)
const isWaiting = (devotion: Devotion): boolean =>
  devotion.status !== SENT_STATUS && (devotion.status === '' || devotion.status === '대기');

// 시트에 남길 발송 시각. sv-SE 로케일이 'YYYY-MM-DD HH:mm:ss' 형태를 준다.
const formatKst = (date: Date): string => date.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });

const main = async (): Promise<void> => {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const chatId = requireEnv('TELEGRAM_CHANNEL_ID');
  const spreadsheetId = requireEnv('GOOGLE_SHEET_ID');

  const devotions = await readDevotions(spreadsheetId);
  const waiting = devotions.filter(isWaiting).sort((a, b) => a.id - b.id);
  console.log(`전체 ${devotions.length}편 중 대기 ${waiting.length}편`);

  // body 가 빈 행은 건너뛰고 다음 글로 넘어간다. 그 자리에서 멈추면 빈 행 하나가
  // 큐 전체를 영구히 막아 매일의 발송이 끊긴다. (CLAUDE.md 5장 규칙 2)
  const skipped: Devotion[] = [];
  let target: Devotion | undefined;
  for (const devotion of waiting) {
    if (devotion.body === '') {
      skipped.push(devotion);
      console.warn(`건너뜀 — ${devotion.rowNumber}행(id=${devotion.id}) 의 body 가 비어 있다.`);
      continue;
    }
    target = devotion;
    break;
  }

  if (target === undefined) {
    // 콘텐츠 고갈. 사람이 채워 넣어야 하므로 알린다. (checklist.md 결정 1)
    throw new Error('발송할 대기 글이 없다. 시트에 묵상글을 추가해야 한다.');
  }

  const text = buildMessage(target);
  console.log(`선택 — id=${target.id}, ${target.rowNumber}행, 조립 ${text.length}자`);

  await sendMessage({ token, chatId, text, parseMode: 'HTML' });
  console.log(`발송 성공 — id=${target.id}`);

  try {
    await markSent(spreadsheetId, target.rowNumber, formatKst(new Date()));
    console.log(`시트 갱신 — ${target.rowNumber}행 status=${SENT_STATUS}`);
  } catch (cause) {
    // 발송은 이미 나갔다. 이 상태로 두면 다음 실행에서 같은 글이 또 나간다.
    // 조용히 넘기지 말고 사람이 손대야 할 일을 그대로 알린다.
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `발송은 성공했으나 시트 갱신에 실패했다. 그대로 두면 다음 실행에서 id=${target.id} 가 중복 발송된다. ` +
        `시트 ${target.rowNumber}행의 status 를 '${SENT_STATUS}' 로 직접 바꿔야 한다. 원인 — ${detail}`,
    );
  }

  if (skipped.length > 0) {
    const rows = skipped.map((devotion) => `${devotion.rowNumber}행(id=${devotion.id})`).join(', ');
    console.error(`발송은 정상이나 건너뛴 행이 있다 — ${rows}. body 를 채우거나 행을 지워야 한다.`);
    process.exitCode = 1;
  }
};

try {
  await main();
} catch (error) {
  // 사람이 개입해야 하는 상황이므로 잡을 실패시킨다. (checklist.md 결정 1)
  console.error(`실패 — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
