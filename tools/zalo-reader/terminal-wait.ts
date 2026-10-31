import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

export type EnterWaitReason = "enter" | "non-interactive" | "stdin-ended" | "stdin-error";

export function waitForTerminalEnter(
  message: string,
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable = process.stdout,
): Promise<EnterWaitReason> {
  if (!input.isTTY || input.destroyed || input.readableEnded) {
    output.write("Không thể chờ Enter: stdin không tương tác hoặc đã đóng; Reader sẽ đóng trình duyệt và kết thúc.\n");
    return Promise.resolve("non-interactive");
  }
  return new Promise((resolve) => {
    const terminal = readline.createInterface({ input, output, terminal: false });
    // An unresolved Promise alone does not keep Node alive when stdin loses its handle.
    const keepAlive = setInterval(() => {}, 1000);
    let finished = false;
    const finish = (reason: EnterWaitReason) => {
      if (finished) return;
      finished = true;
      clearInterval(keepAlive);
      input.off("error", onError);
      terminal.close();
      if (reason !== "enter") {
        output.write(`Không thể tiếp tục chờ Enter (${reason}); Reader sẽ đóng trình duyệt và kết thúc.\n`);
      }
      resolve(reason);
    };
    const onError = () => finish("stdin-error");
    input.once("error", onError);
    terminal.on("error", onError);
    terminal.on("line", (line) => { if (!line.trim()) finish("enter"); });
    terminal.once("close", () => finish("stdin-ended"));
    output.write(`${message}\n`);
    input.resume();
  });
}
