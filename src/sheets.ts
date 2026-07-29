// 구글 스프레드시트의 devotions 탭에서 묵상글 목록을 읽어오는 모듈

import { google } from 'googleapis';

const SHEET_NAME = 'devotions';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const HEADERS = ['id', 'title', 'verseRef', 'verseText', 'body', 'source', 'status', 'sentAt'] as const;
type Header = (typeof HEADERS)[number];

export type Devotion = {
  // 시트의 실제 행 번호. status/sentAt 을 되쓸 때 필요하다. (1행은 헤더이므로 2부터)
  readonly rowNumber: number;
  readonly id: number;
  readonly title: string;
  readonly verseRef: string;
  readonly verseText: string;
  readonly body: string;
  readonly source: string;
  readonly status: string;
  readonly sentAt: string;
};

export const SENT_STATUS = '발송됨';

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || String(value).trim() === '';

const sheetsClient = () =>
  google.sheets({ version: 'v4', auth: new google.auth.GoogleAuth({ scopes: SCOPES }) });

// 헤더 이름 → 열 위치. 열 순서에 의존하지 않기 위해 매번 헤더로 찾는다.
const toColumnMap = (headerRow: readonly unknown[]): Map<string, number> => {
  const columnOf = new Map<string, number>();
  headerRow.forEach((name, index) => {
    if (!isBlank(name)) {
      columnOf.set(String(name).trim(), index);
    }
  });
  return columnOf;
};

// 0-based 열 위치를 A1 표기의 열 문자로 바꾼다. (0 → A, 26 → AA)
const columnLetter = (index: number): string => {
  let remaining = index + 1;
  let letter = '';
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + digit) + letter;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letter;
};

export const readDevotions = async (spreadsheetId: string): Promise<Devotion[]> => {
  const sheets = sheetsClient();

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: SHEET_NAME });
  const rows: unknown[][] = response.data.values ?? [];

  const headerRow = rows[0];
  if (headerRow === undefined) {
    throw new Error(`시트 '${SHEET_NAME}' 가 비어 있다. 1행에 헤더가 있어야 한다.`);
  }

  const columnOf = toColumnMap(headerRow);

  const missing = HEADERS.filter((header) => !columnOf.has(header));
  if (missing.length > 0) {
    throw new Error(`시트 '${SHEET_NAME}' 에 다음 헤더가 없다 — ${missing.join(', ')}`);
  }

  const cell = (row: readonly unknown[], header: Header): string => {
    const index = columnOf.get(header);
    if (index === undefined) return '';
    const value = row[index];
    return isBlank(value) ? '' : String(value).trim();
  };

  const devotions: Devotion[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;

    // 시트 중간의 완전한 빈 행은 정상 입력으로 보고 조용히 넘긴다.
    if (row.every(isBlank)) return;

    const rawId = cell(row, 'id');
    const id = Number(rawId);
    if (rawId === '' || !Number.isFinite(id)) {
      console.warn(`${rowNumber}행 건너뜀 — id 가 숫자가 아니다 ("${rawId}")`);
      return;
    }

    devotions.push({
      rowNumber,
      id,
      title: cell(row, 'title'),
      verseRef: cell(row, 'verseRef'),
      verseText: cell(row, 'verseText'),
      body: cell(row, 'body'),
      source: cell(row, 'source'),
      status: cell(row, 'status'),
      sentAt: cell(row, 'sentAt'),
    });
  });

  return devotions;
};

// 발송 완료 표시. 이 행은 다음 실행부터 대기 목록에서 빠진다. (CLAUDE.md 5장)
export const markSent = async (
  spreadsheetId: string,
  rowNumber: number,
  sentAt: string,
): Promise<void> => {
  const sheets = sheetsClient();

  // 읽을 때와 마찬가지로 열 위치를 헤더에서 다시 찾는다. 열을 옮겨도 엉뚱한 칸에 쓰지 않는다.
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!1:1`,
  });
  const columnOf = toColumnMap(response.data.values?.[0] ?? []);

  const statusColumn = columnOf.get('status');
  const sentAtColumn = columnOf.get('sentAt');
  if (statusColumn === undefined || sentAtColumn === undefined) {
    throw new Error(`시트 '${SHEET_NAME}' 에서 status/sentAt 열을 찾지 못했다.`);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      // RAW — 구글 시트가 값을 날짜로 재해석하지 않고 쓴 그대로 남긴다.
      valueInputOption: 'RAW',
      data: [
        {
          range: `${SHEET_NAME}!${columnLetter(statusColumn)}${rowNumber}`,
          values: [[SENT_STATUS]],
        },
        {
          range: `${SHEET_NAME}!${columnLetter(sentAtColumn)}${rowNumber}`,
          values: [[sentAt]],
        },
      ],
    },
  });
};
