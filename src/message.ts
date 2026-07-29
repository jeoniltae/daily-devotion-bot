// 묵상글 한 편을 텔레그램 HTML 메시지 한 통으로 조립하는 모듈

import type { Devotion } from "./sheets.ts";

// sendMessage 의 text 제한. 태그를 걷어낸 "파싱 후" 길이가 기준이다.
const TEXT_LIMIT = 4096;

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// 같은 조립 규칙으로 HTML 과 평문을 각각 만든다.
// 길이 검사는 태그가 없는 평문 기준이어야 정확하다.
type Style = {
  readonly bold: (text: string) => string;
  readonly quote: (text: string) => string;
  readonly escape: (text: string) => string;
};

const HTML_STYLE: Style = {
  bold: (text) => `<b>🌹 ${text}</b>`,
  quote: (text) => `<blockquote>${text}</blockquote>`,
  escape: escapeHtml,
};

// 길이 검사용. 태그는 빼되 실제로 발송되는 글자(이모지 등)는 HTML_STYLE 과 똑같이 유지해야
// 계산이 어긋나지 않는다.
const PLAIN_STYLE: Style = {
  bold: (text) => `🌹 ${text}`,
  quote: (text) => text,
  escape: (text) => text,
};

// 구절 표기(verseRef) 앞에 붙는 표식. 바꾸려면 여기만 고치면 된다.
const VERSE_REF_MARK = "📖";

// 비어 있는 항목은 블록째로 빠지므로 줄바꿈이 남지 않는다. (CLAUDE.md 5장)
const assemble = (devotion: Devotion, style: Style): string => {
  const { escape, bold, quote } = style;
  const blocks: string[] = [];

  if (devotion.title !== "") {
    blocks.push(bold(escape(devotion.title)));
  }

  // 성경 본문과 구절 표기를 하나의 인용 블록으로 묶는다.
  // 표기를 블록 밖에 두면 앞의 본문과 무관한 줄처럼 보인다.
  const verseLines: string[] = [];
  if (devotion.verseText !== "") {
    verseLines.push(escape(devotion.verseText));
  }
  if (devotion.verseRef !== "") {
    verseLines.push(`${VERSE_REF_MARK} ${escape(devotion.verseRef)}`);
  }
  if (verseLines.length > 0) {
    blocks.push(quote(verseLines.join("\n")));
  }

  if (devotion.body !== "") {
    blocks.push(escape(devotion.body));
  }

  if (devotion.source !== "") {
    blocks.push(`🎈 ${escape(devotion.source)}`);
  }

  return blocks.join("\n\n");
};

export const buildMessage = (devotion: Devotion): string => {
  const plain = assemble(devotion, PLAIN_STYLE);

  if (plain.length > TEXT_LIMIT) {
    // 잘라서 내보내면 잘린 글이 공개 아카이브에 영구히 남는다. 발송하지 않고 실패시킨다.
    throw new Error(
      `id=${devotion.id} 메시지가 ${plain.length}자로 텔레그램 제한 ${TEXT_LIMIT}자를 넘는다. 시트에서 본문을 줄여야 한다.`,
    );
  }

  return assemble(devotion, HTML_STYLE);
};
