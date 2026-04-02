#!/usr/bin/env node
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");

const RELAY_DIR = path.join(os.homedir(), "Desktop", "claude-relay");
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
    lines.push(`---\n**ID:** ${i.id}\n**From:** ${i.from} | **Priority:** ${i.priority} | **Status:** ${i.status}\n**Time:** ${ts}\n\n${i.message}\n`);
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

async function main() {
  ensureDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`Claude Relay MCP server running.\nQueue: ${QUEUE_FILE}\n`);
}
main().catch(err => { process.stderr.write(`Fatal: ${err}\n`); process.exit(1); });
