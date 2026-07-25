import { describe, expect, it } from "vitest";
import { parseTranscript, categorizeTool, deriveProjectName } from "../../src/services/transcript-parser.js";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("deriveProjectName", () => {
  it("decodes Claude Code's dash-encoded cwd directory name", () => {
    expect(deriveProjectName("/home/x/.claude/projects/-Users-alice-code-my-app/session.jsonl")).toBe(
      "Users/alice/code/my/app"
    );
  });
});

describe("categorizeTool", () => {
  it("maps known tools to categories", () => {
    expect(categorizeTool("Read")).toBe("read");
    expect(categorizeTool("Edit")).toBe("edit");
    expect(categorizeTool("Bash")).toBe("execute");
    expect(categorizeTool("WebSearch")).toBe("web");
  });

  it("falls back to other for unknown tools", () => {
    expect(categorizeTool("SomeRandomTool")).toBe("other");
  });
});

describe("parseTranscript", () => {
  const sessionId = "sess-1";
  const filePath = "/home/x/.claude/projects/-tmp-demo/sess-1.jsonl";

  it("returns null when no valid session lines exist", () => {
    expect(parseTranscript(filePath, ["not json", ""])).toBeNull();
  });

  it("extracts session metadata and tool calls from a well-formed transcript", () => {
    const toolId = "tool-1";
    const lines = [
      line({
        type: "user",
        sessionId,
        cwd: "/tmp/demo",
        timestamp: "2026-01-01T10:00:00.000Z",
        message: { role: "user", content: "please fix the bug" },
      }),
      line({
        type: "assistant",
        sessionId,
        timestamp: "2026-01-01T10:00:05.000Z",
        message: {
          role: "assistant",
          model: "claude-sonnet-5",
          usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 },
          content: [
            { type: "thinking", thinking: "let me look" },
            { type: "tool_use", id: toolId, name: "Read", input: { file_path: "/tmp/demo/main.py" } },
          ],
        },
      }),
      line({
        type: "user",
        sessionId,
        timestamp: "2026-01-01T10:00:07.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolId, is_error: false, content: "file contents" }],
        },
      }),
      line({
        type: "summary",
        sessionId,
        timestamp: "2026-01-01T10:00:08.000Z",
      }),
    ];

    const parsed = parseTranscript(filePath, lines);
    expect(parsed).not.toBeNull();
    expect(parsed!.session.id).toBe(sessionId);
    expect(parsed!.session.turnCount).toBe(3);
    expect(parsed!.session.thinkingBlockCount).toBe(1);
    expect(parsed!.session.compactionCount).toBe(1);
    expect(parsed!.session.model).toBe("claude-sonnet-5");
    expect(parsed!.session.maxContextTokens).toBe(1200);
    expect(parsed!.toolCalls).toHaveLength(1);
    expect(parsed!.toolCalls[0]).toMatchObject({
      toolName: "Read",
      status: "success",
      category: "read",
      filePath: "/tmp/demo/main.py",
    });
  });

  it("marks a tool_result with is_error true as an error and counts it", () => {
    const toolId = "tool-err";
    const lines = [
      line({ type: "user", sessionId, timestamp: "2026-01-01T10:00:00.000Z", message: { role: "user", content: "go" } }),
      line({
        type: "assistant",
        sessionId,
        timestamp: "2026-01-01T10:00:01.000Z",
        message: { role: "assistant", content: [{ type: "tool_use", id: toolId, name: "Bash", input: { command: "false" } }] },
      }),
      line({
        type: "user",
        sessionId,
        timestamp: "2026-01-01T10:00:02.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolId, is_error: true, content: "boom" }] },
      }),
    ];

    const parsed = parseTranscript(filePath, lines);
    expect(parsed!.session.errorCount).toBe(1);
    expect(parsed!.toolCalls[0]!.status).toBe("error");
  });

  it("tolerates a corrupted line without aborting the rest of the file", () => {
    const toolId = "tool-ok";
    const lines = [
      "{ this is not valid json",
      line({ type: "user", sessionId, timestamp: "2026-01-01T10:00:00.000Z", message: { role: "user", content: "go" } }),
      line({
        type: "assistant",
        sessionId,
        timestamp: "2026-01-01T10:00:01.000Z",
        message: { role: "assistant", content: [{ type: "tool_use", id: toolId, name: "Grep", input: { pattern: "TODO" } }] },
      }),
      line({
        type: "user",
        sessionId,
        timestamp: "2026-01-01T10:00:02.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolId, content: "match" }] },
      }),
    ];

    const parsed = parseTranscript(filePath, lines);
    expect(parsed).not.toBeNull();
    expect(parsed!.toolCalls).toHaveLength(1);
  });

  it("flushes a tool_use with no matching tool_result as status unknown", () => {
    const lines = [
      line({ type: "user", sessionId, timestamp: "2026-01-01T10:00:00.000Z", message: { role: "user", content: "go" } }),
      line({
        type: "assistant",
        sessionId,
        timestamp: "2026-01-01T10:00:01.000Z",
        message: { role: "assistant", content: [{ type: "tool_use", id: "orphan", name: "Bash", input: { command: "sleep 100" } }] },
      }),
    ];

    const parsed = parseTranscript(filePath, lines);
    expect(parsed!.toolCalls).toHaveLength(1);
    expect(parsed!.toolCalls[0]!.status).toBe("unknown");
  });
});
