import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "permission_log.jsonl");

function log(entry) {
  entry.timestamp = new Date().toISOString();
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(LOG_FILE, line);
  process.stderr.write(`[PERM] ${entry.event}: ${JSON.stringify(entry)}\n`);
}

log({ event: "server_starting" });

const server = new McpServer({
  name: "permission-bridge-test",
  version: "0.1.0",
});

server.tool(
  "permission_prompt",
  "Handles permission prompts from Claude Code. Called when Claude wants to use a tool and needs permission.",
  {
    tool_name: z.string().describe("The tool Claude wants to use"),
    tool_input: z.record(z.unknown()).describe("The tool input parameters"),
    tool_use_id: z.string().optional().describe("Unique ID for this tool use"),
  },
  async ({ tool_name, tool_input, tool_use_id }) => {
    log({
      event: "permission_request",
      claude_tool: tool_name,
      claude_input: tool_input,
      tool_use_id,
    });

    // --- AskUserQuestion interception ---
    if (tool_name === "AskUserQuestion") {
      const questions = tool_input.questions || [];
      const answers = {};

      for (const q of questions) {
        const questionText = q.question || "";
        const options = q.options || [];
        const answer = options.length > 0 ? options[0].label : "test-answer";
        answers[questionText] = answer;

        log({
          event: "ASK_USER_INTERCEPTED",
          question: questionText,
          options: options.map((o) => o.label),
          auto_answer: answer,
        });
      }

      const payload = {
        behavior: "allow",
        updatedInput: { ...tool_input, answers },
      };

      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    }

    // --- All other tools: auto-allow ---
    log({ event: "auto_allow", tool: tool_name });
    const payload = {
      behavior: "allow",
      updatedInput: tool_input,
    };

    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
log({ event: "server_connected" });
