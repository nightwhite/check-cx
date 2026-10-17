"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 单独成块，只有存在公告时才按需加载 Markdown 渲染依赖
export default function NotificationMarkdown({ message }: { message: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{message}</ReactMarkdown>;
}
