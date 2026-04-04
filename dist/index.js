#!/usr/bin/env node
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

// --- Config: resolve data directory from relay.config.json ---
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "relay.config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { dataDir: "./data" };
  }
}

const config = loadConfig();
const RELAY_DIR = path.resolve(PROJECT_ROOT, config.dataDir);
const QUEUE_FILE = path.join(RELAY_DIR, "instructions.json");

function ensureDir() {
  if (!fs.existsSync(RELAY_DIR)) fs.mkdirSync(RELAY_DIR, { recursive: true });
}

function loadQueue() {
  ensureDir();
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8")); }
  catch { return []; }
}

function saveQueue(queue) {
  ensureDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf-8");
}

const server = new McpServer({ name: "claude-relay-mcp-server", version: "1.0.0" });

// Send an instruction into the queue
server.registerTool("send_instruction", {
  title: "Send Instruction",
  description: "Send an instruction to another Claude Code session. The receiving session calls get_instructions to pick it up and act on it.",
  inputSchema: {
    message: z.string().min(1).describe("The instruction or task to relay"),
    from: z.string().default("Claude Code").describe("Label for who is sending"),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async ({ message, from, priority }) => {
  const queue = loadQueue();
  const instr = {
    id: `instr_${Date.now()}`,
    timestamp: new Date().toISOString(),
    from,
    priority,
    message,
    status: "pending",
    replies: [],
  };
  queue.push(instr);
  saveQueue(queue);
  return { content: [{ type: "text", text: `✅ Instruction queued.\nID: ${instr.id}\nFrom: ${from} | Priority: ${priority}\n\n${message}` }] };
});

// Receive pending instructions
server.registerTool("get_instructions", {
  title: "Get Instructions",
  description: "Retrieve instructions from the relay queue. Call this at the start of a session to check for tasks sent by another Claude Code instance.",
  inputSchema: {
    status: z.enum(["pending", "done", "all"]).default("pending"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async ({ status, limit }) => {
  const all = loadQueue();
  const items = (status === "all" ? all : all.filter(i => i.status === status)).slice(0, limit);
  if (!items.length) return { content: [{ type: "text", text: `No ${status} instructions.` }] };

  const lines = [`# Relay Instructions (${status})\n`];
  for (const i of items) {
    const ts = new Date(i.timestamp).toLocaleString();
    let entry = `---\n**ID:** ${i.id}\n**From:** ${i.from} | **Priority:** ${i.priority} | **Status:** ${i.status}\n**Time:** ${ts}\n\n${i.message}\n`;
    if (i.replies && i.replies.length > 0) {
      entry += `\n**Replies (${i.replies.length}):**\n`;
      for (const r of i.replies) {
        const rts = new Date(r.timestamp).toLocaleString();
        entry += `  - [${rts}] **${r.from}:** ${r.message}\n`;
      }
    }
    lines.push(entry);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

// Mark an instruction as done
server.registerTool("mark_instruction_done", {
  title: "Mark Instruction Done",
  description: "Mark a relayed instruction as done once you have completed it.",
  inputSchema: {
    id: z.string().describe("Instruction ID"),
    note: z.string().optional().describe("Optional completion note"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async ({ id, note }) => {
  const queue = loadQueue();
  const idx = queue.findIndex(i => i.id === id);
  if (idx === -1) return { content: [{ type: "text", text: `No instruction found: ${id}` }] };
  queue[idx].status = "done";
  queue[idx].completed_at = new Date().toISOString();
  if (note) queue[idx].completion_note = note;
  saveQueue(queue);
  return { content: [{ type: "text", text: `✅ Marked done: ${id}${note ? `\nNote: ${note}` : ""}` }] };
});

// Clear done (or all) instructions
server.registerTool("clear_instructions", {
  title: "Clear Instructions",
  description: "Remove done instructions from the queue. Set confirm_all to true to wipe everything including pending.",
  inputSchema: {
    confirm_all: z.boolean().default(false),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}, async ({ confirm_all }) => {
  const all = loadQueue();
  const kept = confirm_all ? [] : all.filter(i => i.status !== "done");
  saveQueue(kept);
  return { content: [{ type: "text", text: `🗑️ Cleared ${all.length - kept.length} instruction(s). ${kept.length} remaining.` }] };
});

// Reply to a specific instruction
server.registerTool("reply_to_instruction", {
  title: "Reply to Instruction",
  description: "Send a reply to a specific instruction by ID. This enables two-way communication between Claude Code sessions.",
  inputSchema: {
    id: z.string().describe("The instruction ID to reply to"),
    message: z.string().min(1).describe("The reply message"),
    from: z.string().default("Claude Code").describe("Label for who is replying"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async ({ id, message, from }) => {
  const queue = loadQueue();
  const idx = queue.findIndex(i => i.id === id);
  if (idx === -1) return { content: [{ type: "text", text: `No instruction found: ${id}` }] };
  if (!queue[idx].replies) queue[idx].replies = [];
  const reply = {
    from,
    message,
    timestamp: new Date().toISOString(),
  };
  queue[idx].replies.push(reply);
  saveQueue(queue);
  return { content: [{ type: "text", text: `✅ Reply added to ${id}.\nFrom: ${from}\n\n${message}` }] };
});

// Get replies for a specific instruction
server.registerTool("get_replies", {
  title: "Get Replies",
  description: "Fetch all replies for a specific instruction by ID.",
  inputSchema: {
    id: z.string().describe("The instruction ID to get replies for"),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async ({ id }) => {
  const queue = loadQueue();
  const instr = queue.find(i => i.id === id);
  if (!instr) return { content: [{ type: "text", text: `No instruction found: ${id}` }] };
  const replies = instr.replies || [];
  if (!replies.length) return { content: [{ type: "text", text: `No replies for instruction ${id}.` }] };

  const lines = [`# Replies for ${id}\n`];
  for (const r of replies) {
    const ts = new Date(r.timestamp).toLocaleString();
    lines.push(`- [${ts}] **${r.from}:** ${r.message}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

async function main() {
  ensureDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`Claude Relay MCP server running.\nData: ${RELAY_DIR}\nQueue: ${QUEUE_FILE}\n`);
}
main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
