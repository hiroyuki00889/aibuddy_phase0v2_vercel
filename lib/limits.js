// コスト対策の共通制限値
export const MAX_USER_INPUT_CHARS = 2000;
export const MAX_CHAT_HISTORY_MESSAGES = 16;
export const MAX_SUMMARY_HISTORY_MESSAGES = 30;

export function findOversizedUserMessage(messages, maxChars = MAX_USER_INPUT_CHARS) {
  return messages.find(
    (m) => m?.role === "user" && typeof m.content === "string" && m.content.length > maxChars
  );
}

export function trimHistory(messages, maxMessages) {
  return messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
}
