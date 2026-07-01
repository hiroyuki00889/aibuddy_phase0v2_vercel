// api/contact.js

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]?.trim() || "";
  }
  return req.socket?.remoteAddress || "";
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY is not set" });
  }

  const contactToEmail = process.env.CONTACT_TO_EMAIL;
  const contactFromEmail = process.env.CONTACT_FROM_EMAIL || "AIbo！ <onboarding@resend.dev>";

  if (!contactToEmail) {
    return res.status(500).json({ error: "CONTACT_TO_EMAIL is not set" });
  }

  const {
    type = "",
    email = "",
    message = "",
    mode = "",
    userAgent = ""
  } = req.body || {};

  const safeType = String(type).trim();
  const safeEmail = String(email).trim();
  const safeMessage = String(message).trim();
  const safeMode = String(mode).trim();
  const safeUserAgent = String(userAgent).trim();

  if (!safeType) {
    return res.status(400).json({ error: "お問い合わせ種別を選択してください。" });
  }

  if (!safeMessage || safeMessage.length < 5) {
    return res.status(400).json({ error: "お問い合わせ内容を5文字以上で入力してください。" });
  }

  if (safeMessage.length > 3000) {
    return res.status(400).json({ error: "お問い合わせ内容は3000文字以内で入力してください。" });
  }

  if (!isValidEmail(safeEmail)) {
    return res.status(400).json({ error: "メールアドレスの形式が正しくありません。" });
  }

  const ip = getClientIp(req);
  const createdAt = new Date().toISOString();

  const subject = `[AIbo！問い合わせ] ${safeType}`;

  const text = [
    "AIbo！にお問い合わせが届きました。",
    "",
    `種別: ${safeType}`,
    `メール: ${safeEmail || "未入力"}`,
    `モード: ${safeMode || "不明"}`,
    `日時: ${createdAt}`,
    `IP: ${ip || "不明"}`,
    `User-Agent: ${safeUserAgent || "不明"}`,
    "",
    "内容:",
    safeMessage
  ].join("\n");

  const html = `
    <h2>AIbo！にお問い合わせが届きました</h2>
    <p><strong>種別:</strong> ${escapeHtml(safeType)}</p>
    <p><strong>メール:</strong> ${escapeHtml(safeEmail || "未入力")}</p>
    <p><strong>モード:</strong> ${escapeHtml(safeMode || "不明")}</p>
    <p><strong>日時:</strong> ${escapeHtml(createdAt)}</p>
    <p><strong>IP:</strong> ${escapeHtml(ip || "不明")}</p>
    <p><strong>User-Agent:</strong> ${escapeHtml(safeUserAgent || "不明")}</p>
    <hr />
    <p><strong>内容:</strong></p>
    <pre style="white-space: pre-wrap; font-family: sans-serif;">${escapeHtml(safeMessage)}</pre>
  `;

  try {
    const result = await resend.emails.send({
      from: contactFromEmail,
      to: contactToEmail,
      replyTo: safeEmail || undefined,
      subject,
      text,
      html
    });

    return res.status(200).json({
      ok: true,
      id: result?.data?.id || null
    });
  } catch (error) {
    console.error("contact send failed:", error);
    return res.status(500).json({
      error: "お問い合わせの送信に失敗しました。時間をおいてもう一度お試しください。"
    });
  }
}