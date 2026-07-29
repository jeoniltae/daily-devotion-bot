// 텔레그램 Bot API 로 채널에 메시지를 보내는 최소 래퍼

const API_BASE = 'https://api.telegram.org';

export type SendMessageParams = {
  readonly token: string;
  readonly chatId: string;
  readonly text: string;
  readonly parseMode?: 'HTML' | 'MarkdownV2';
};

// 요청 URL 에 봇 토큰이 들어가므로, 밖으로 나가는 문자열에서는 반드시 지운다.
// Actions 로그에 한 번 찍히면 회수할 수 없다. (CLAUDE.md 8장)
const redact = (text: string, token: string): string => text.replaceAll(token, '<TOKEN>');

export const sendMessage = async (params: SendMessageParams): Promise<void> => {
  const { token, chatId, text, parseMode } = params;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
  } catch (cause) {
    throw new Error(`텔레그램 API 요청 실패 — ${redact(String(cause), token)}`);
  }

  // 텔레그램은 실패를 HTTP 상태와 본문 양쪽으로 알린다. 둘 다 확인한다.
  const body: unknown = await response.json().catch(() => null);
  const ok = response.ok && typeof body === 'object' && body !== null && 'ok' in body && body.ok === true;

  if (!ok) {
    const detail = redact(JSON.stringify(body), token);
    throw new Error(`텔레그램 발송 실패 (HTTP ${response.status}) — ${detail}`);
  }
};
