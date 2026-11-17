/**
 * 直连模式的原始 HTTP/1.1 请求：fetch 无法覆盖 Host 头，
 * 因此通过 TCP 套接字手写请求，按配置的 Host 访问同一源站上的虚拟主机。
 */

export interface DirectTcpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
}

export type OpenDirectSocket = (
  url: URL
) => Promise<DirectTcpSocket> | DirectTcpSocket;

export interface DirectHttpRequest {
  method: "GET" | "POST";
  url: string;
  hostHeader: string;
  headers?: Headers;
  body?: string;
  timeoutMs: number;
  openSocket?: OpenDirectSocket;
  /** 收到首个响应字节时回调，用于记录首字节延迟。 */
  onFirstChunk?: () => void;
  /**
   * 首字节前连接级瞬断（如上游 RST，报 "This socket has been closed."）的额外重试次数。
   * 默认 1。仅在尚未收到任何响应字节时重试，避免重复发送已被处理的请求。
   */
  connectRetries?: number;
  /** 重试间隔（毫秒），默认 300。注入以便测试。 */
  sleep?: (ms: number) => Promise<void>;
}

/** 收到响应首字节后再中断，用此错误标记「已读取过、不可安全重试」。 */
class SocketClosedAfterFirstByteError extends Error {}

const TRANSIENT_CONNECT_ERROR_PATTERNS = [
  /socket .*closed/i,
  /connection reset/i,
  /network connection lost/i,
  /connection .*closed/i,
  /econnreset/i,
];

/** 判断是否为可重试的连接级瞬断（仅限首字节前发生）。 */
function isTransientConnectError(error: unknown): boolean {
  if (error instanceof SocketClosedAfterFirstByteError) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_CONNECT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface DirectHttpResponse {
  status: number;
  /** 原始响应头文本（不含状态行之后的空行）。 */
  head: string;
  contentType: string;
  bodyText: string;
}

export async function openCloudflareSocket(url: URL): Promise<DirectTcpSocket> {
  const { connect } = await import("cloudflare:sockets");
  return connect({
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 80,
  });
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** chunked 的块大小按字节计数，必须基于字节解码，字符串切片会因多字节字符错位。 */
function decodeChunkedBodyBytes(input: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let index = 0;
  const sizeDecoder = new TextDecoder();
  while (index < input.length) {
    let lineEnd = index;
    while (
      lineEnd + 1 < input.length &&
      !(input[lineEnd] === 13 && input[lineEnd + 1] === 10)
    ) {
      lineEnd++;
    }
    if (lineEnd + 1 >= input.length) {
      break;
    }
    const sizeToken = sizeDecoder
      .decode(input.subarray(index, lineEnd))
      .split(";")[0]
      .trim();
    const size = Number.parseInt(sizeToken, 16);
    if (!Number.isFinite(size) || size <= 0) {
      break;
    }
    parts.push(input.subarray(lineEnd + 2, lineEnd + 2 + size));
    index = lineEnd + 2 + size + 2;
  }
  return concatBytes(parts);
}

/** 执行单次直连请求，不含重试。 */
async function attemptDirectHttpRequest(
  request: DirectHttpRequest,
  url: URL
): Promise<DirectHttpResponse> {
  const openSocket = request.openSocket ?? openCloudflareSocket;
  const socket = await openSocket(url);
  const timer = setTimeout(() => {
    try {
      socket.close();
    } catch {
      // 关闭已断开的套接字无需处理。
    }
  }, request.timeoutMs);

  try {
    const writer = socket.writable.getWriter();
    const bodyBytes = request.body ? new TextEncoder().encode(request.body) : null;
    const headerLines: string[] = [`Host: ${request.hostHeader}`];
    request.headers?.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "content-length" || lower === "connection") {
        return;
      }
      headerLines.push(`${key}: ${value}`);
    });
    if (bodyBytes) {
      headerLines.push(`Content-Length: ${bodyBytes.length}`);
    }
    headerLines.push("Connection: close");
    const head = `${[
      `${request.method} ${url.pathname}${url.search} HTTP/1.1`,
      ...headerLines,
    ].join("\r\n")}\r\n\r\n`;
    await writer.write(new TextEncoder().encode(head));
    if (bodyBytes) {
      await writer.write(bodyBytes);
    }

    const reader = socket.readable.getReader();
    let receivedFirstChunk = false;
    const byteChunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          request.onFirstChunk?.();
        }
        byteChunks.push(value);
      }
    } catch (error) {
      // 已读到首字节后再中断，说明请求可能已被上游处理，重试不安全：
      // 包装成专用错误，让上层停止重试。
      if (receivedFirstChunk) {
        throw new SocketClosedAfterFirstByteError(
          error instanceof Error ? error.message : String(error)
        );
      }
      throw error;
    }
    const rawBytes = concatBytes(byteChunks);
    const raw = new TextDecoder().decode(rawBytes);

    const headerEndIndex = raw.indexOf("\r\n\r\n");
    const responseHead = headerEndIndex === -1 ? raw : raw.slice(0, headerEndIndex);
    const statusMatch = responseHead.match(/^HTTP\/\d(?:\.\d)? (\d{3})/);

    // 头部为 ASCII，字符串索引与字节偏移一致，可安全用于切分字节流。
    const bodyStartByte = headerEndIndex === -1 ? rawBytes.length : headerEndIndex + 4;
    let responseBodyBytes = rawBytes.subarray(bodyStartByte);
    if (/transfer-encoding:\s*chunked/i.test(responseHead)) {
      responseBodyBytes = decodeChunkedBodyBytes(responseBodyBytes);
    }

    return {
      status: statusMatch ? Number(statusMatch[1]) : 0,
      head: responseHead,
      contentType: (
        responseHead.match(/content-type:\s*([^\r\n]+)/i)?.[1] ?? ""
      ).toLowerCase(),
      bodyText: new TextDecoder().decode(responseBodyBytes),
    };
  } finally {
    clearTimeout(timer);
    try {
      socket.close();
    } catch {
      // 关闭已断开的套接字无需处理。
    }
  }
}

export async function performDirectHttpRequest(
  request: DirectHttpRequest
): Promise<DirectHttpResponse> {
  const url = new URL(request.url);
  if (url.protocol !== "http:") {
    throw new Error("直连模式仅支持 http:// 端点（自定义 Host 无法通过 TLS 证书校验）");
  }

  const maxRetries = request.connectRetries ?? 1;
  const sleep = request.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await attemptDirectHttpRequest(request, url);
    } catch (error) {
      lastError = error;
      // 仅对首字节前的连接级瞬断重试：上游 RST 等抖动一次重试即可恢复，
      // 已收到响应或非连接错误则直接抛出。
      if (attempt < maxRetries && isTransientConnectError(error)) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw error instanceof SocketClosedAfterFirstByteError
        ? new Error(error.message)
        : error;
    }
  }
  // 理论不可达：循环要么 return 要么 throw。
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
