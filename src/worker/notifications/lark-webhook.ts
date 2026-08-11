export interface LarkNotificationInput {
  webhookUrl: string;
  siteName: string;
  publicOrigin: string | null;
  channelName: string;
  model: string;
  status: "degraded" | "failed" | "recovered";
  latencyMs: number | null;
  message: string | null;
  checkedAt: string;
}

export async function sendLarkNotification(
  input: LarkNotificationInput
): Promise<void> {
  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: {
          title: {
            tag: "plain_text",
            content: `${input.siteName} 状态通知`,
          },
        },
        elements: [
          {
            tag: "div",
            text: { tag: "lark_md", content: `**渠道**：${input.channelName}` },
          },
          {
            tag: "div",
            text: { tag: "lark_md", content: `**模型**：${input.model}` },
          },
          {
            tag: "div",
            text: { tag: "lark_md", content: `**状态**：${input.status}` },
          },
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**首字**：${input.latencyMs ?? "—"} ms`,
            },
          },
          {
            tag: "div",
            text: { tag: "lark_md", content: `**时间**：${input.checkedAt}` },
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Lark webhook failed: ${response.status}`);
  }
}
