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
}

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

export async function performDirectHttpRequest(
  request: DirectHttpRequest
): Promise<DirectHttpResponse> {
  const url = new URL(request.url);
  if (url.protocol !== "http:") {
    throw new Error("直连模式仅支持 http:// 端点（自定义 Host 无法通过 TLS 证书校验）");
  }

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
