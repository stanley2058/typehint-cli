import net from "node:net";

export type RpcRequest = {
  id: string;
  method: string;
  params?: any;
};

export type RpcResponse = {
  id: string;
  result?: any;
  error?: { message: string; stack?: string };
};

export function writeJsonLine(sock: net.Socket, obj: any) {
  sock.write(JSON.stringify(obj) + "\n");
}

export function createJsonLineParser(onLine: (obj: any) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) break;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onLine(JSON.parse(trimmed));
      } catch {
        // ignore malformed
      }
    }
  };
}
