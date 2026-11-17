import { describe, expect, it, vi } from "vitest";

import {
  performDirectHttpRequest,
  type DirectTcpSocket,
} from "../../../src/worker/providers/direct-http";

const encoder = new TextEncoder();
const OK_RESPONSE =
  "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n" +
  '{"ok":true}';

/** 构造一个一次性读出完整响应的 mock socket。 */
function okSocket(body = OK_RESPONSE): DirectTcpSocket {
  return {
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>({ write() {} }),
    close() {},
  };
}

/** 构造一个在首字节前就报错（上游 RST）的 mock socket。 */
function resetBeforeFirstByteSocket(message: string): DirectTcpSocket {
  return {
    readable: new ReadableStream<Uint8Array>({
      pull() {
        throw new Error(message);
      },
    }),
    writable: new WritableStream<Uint8Array>({ write() {} }),
    close() {},
  };
}

/** 构造一个先吐出部分字节、随后中断的 mock socket（首字节后中断）。 */
function closeAfterFirstByteSocket(): DirectTcpSocket {
  let pulls = 0;
  return {
    readable: new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode("HTTP/1.1 200 OK\r\n"));
          return;
        }
        throw new Error("This socket has been closed.");
      },
    }),
    writable: new WritableStream<Uint8Array>({ write() {} }),
    close() {},
  };
}

const baseRequest = {
  method: "POST" as const,
  url: "http://152.53.240.240/v1/messages",
  hostHeader: "www.example.com",
  body: "{}",
  timeoutMs: 1_000,
  sleep: async () => {},
};

describe("performDirectHttpRequest 瞬断重试", () => {
  it("首字节前的连接瞬断会重试一次并成功", async () => {
    const openSocket = vi.fn<(url: URL) => DirectTcpSocket>()
      .mockReturnValueOnce(resetBeforeFirstByteSocket("This socket has been closed."))
      .mockReturnValueOnce(okSocket());

    const response = await performDirectHttpRequest({ ...baseRequest, openSocket });

    expect(openSocket).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.bodyText).toBe('{"ok":true}');
  });

  it("连续两次瞬断（超过重试上限）最终抛出", async () => {
    const openSocket = vi.fn<(url: URL) => DirectTcpSocket>()
      .mockImplementation(() => resetBeforeFirstByteSocket("Connection reset"));

    await expect(
      performDirectHttpRequest({ ...baseRequest, openSocket })
    ).rejects.toThrow(/connection reset/i);
    // 默认 1 次重试 = 共 2 次尝试。
    expect(openSocket).toHaveBeenCalledTimes(2);
  });

  it("非连接类错误不重试", async () => {
    const openSocket = vi.fn<(url: URL) => DirectTcpSocket>().mockImplementation(() => {
      throw new Error("ENOTFOUND dns failure");
    });

    await expect(
      performDirectHttpRequest({ ...baseRequest, openSocket })
    ).rejects.toThrow(/ENOTFOUND/);
    expect(openSocket).toHaveBeenCalledTimes(1);
  });

  it("已收到首字节后再中断不重试（请求可能已被处理）", async () => {
    const openSocket = vi.fn<(url: URL) => DirectTcpSocket>()
      .mockReturnValueOnce(closeAfterFirstByteSocket())
      .mockReturnValueOnce(okSocket());

    await expect(
      performDirectHttpRequest({ ...baseRequest, openSocket })
    ).rejects.toThrow(/socket has been closed/i);
    expect(openSocket).toHaveBeenCalledTimes(1);
  });

  it("connectRetries=0 时不重试", async () => {
    const openSocket = vi.fn<(url: URL) => DirectTcpSocket>()
      .mockReturnValue(resetBeforeFirstByteSocket("This socket has been closed."));

    await expect(
      performDirectHttpRequest({ ...baseRequest, openSocket, connectRetries: 0 })
    ).rejects.toThrow(/socket has been closed/i);
    expect(openSocket).toHaveBeenCalledTimes(1);
  });
});
