# 🤖 Claude Relay MCP Server

> **Two AI brains. One mission. Zero manual intervention.**

Claude Relay MCP Server is the communication backbone of the **AVI** (Asistent Virtualne Inteligencije) personal AI infrastructure — a bridge that lets Claude in Cowork mode send instructions directly to Claude Code, which executes them autonomously in the background while you get on with your life.

No copy-pasting. No tab-switching. No waiting. Just delegate and done.

---

## What Problem Does This Solve?

Claude Cowork is great for planning, research, and high-level thinking. Claude Code is great for executing — running scripts, pushing to GitHub, building files. But they're separate sessions that can't talk to each other out of the box.

**Claude Relay fixes that.**

It creates a shared instruction queue that Cowork (AVI) can write to and Claude Code can read from — enabling a full **human → AVI → Claude Code** pipeline where you simply tell AVI what you want, and Claude Code gets it done silently in the background.

---

## How It Works

```
You
 │
 ▼
AVI (Claude Cowork)
 │  sends instruction via MCP tool
 ▼
instructions.json  ◄── relay queue on your desktop
 │
 ▼
relay-watcher.sh  ◄── polls every 2 seconds
 │  detects new pending instruction
 ▼
Claude Code  ◄── auto-executes with full permissions
 │  marks instruction as done
 ▼
Done ✅ (no human involved)
```

### Components

| Component | What it does |
|---|---|
| **MCP Server** (`dist/index.js`) | Exposes `send_instruction`, `get_instructions`, `mark_instruction_done`, `clear_instructions` tools to Claude |
| **Relay Queue** (`~/Desktop/claude-relay/instructions.json`) | JSON file acting as the shared message bus between sessions |
| **Watcher Script** (`relay-watcher.sh`) | Bash daemon that polls the queue every 2s and fires Claude Code when pending instructions appear |

---

## Features

- ✅ **Fully autonomous** — Claude Code reacts without you lifting a finger
- ✅ **Priority levels** — `low`, `normal`, `high` per instruction
- ✅ **Status tracking** — `pending` → `in_progress` → `done`
- ✅ **Persistent queue** — instructions survive session restarts
- ✅ **Lightweight** — a single JSON file, no database required
- ✅ **MCP-native** — works with any MCP-compatible Claude client
- ✅ **Auditable** — full instruction history in plain JSON you can inspect

---

## Built With

- **Node.js** — MCP server runtime
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — official MCP SDK
- **Zod** — runtime schema validation for instruction payloads
- **Bash** — relay watcher daemon
- **Claude Code** (`claude --print --dangerously-skip-permissions`) — the autonomous executor

---

## Installation

### Prerequisites

- Node.js 18+
- [Claude Code](https://claude.ai/code) installed (`npm install -g @anthropic-ai/claude-code`)
- Claude Desktop with MCP support

### 1. Clone & Install

```bash
git clone https://github.com/miroslavostojicdev/claude-relay-mcp-server.git
cd claude-relay-mcp-server
npm install
```

### 2. Create the Relay Queue

```bash
mkdir -p ~/Desktop/claude-relay
echo "[]" > ~/Desktop/claude-relay/instructions.json
```

### 3. Register the MCP Server in Claude Desktop

Add to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/`):

```json
{
  "mcpServers": {
    "claude-relay": {
      "command": "node",
      "args": ["/path/to/claude-relay-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop to load the server.

### 4. Start the Relay Watcher

Run this once — it stays alive in the background and watches for incoming instructions:

```bash
nohup bash /path/to/claude-relay-mcp-server/relay-watcher.sh > ~/Desktop/claude-relay/watcher.log 2>&1 &
```

To verify it's running:

```bash
tail -f ~/Desktop/claude-relay/watcher.log
```

You should see:
```
AVI Relay Watcher running... watching /Users/yourname/Desktop/claude-relay/instructions.json
```

---

## Usage

### Sending an Instruction (from Claude Cowork / AVI)

Once the MCP server is registered, Claude can use the `send_instruction` tool:

```
Send this to Claude Code: "Create a Python script that scrapes
our product page and outputs a CSV of all pricing tiers.
Save it to ~/Desktop/price-scraper.py and run it."
```

AVI will call `mcp__claude-relay__send_instruction` behind the scenes. The watcher picks it up within 2 seconds, Claude Code executes it, and marks it done.

### Available MCP Tools

| Tool | Description |
|---|---|
| `send_instruction` | Queue a new instruction with optional priority |
| `get_instructions` | Read all instructions (used by Claude Code to see what's pending) |
| `mark_instruction_done` | Mark an instruction as completed |
| `clear_instructions` | Wipe the queue |

### Example: High-Priority Instruction

```json
{
  "message": "Push all changes in ~/Desktop/R&D to GitHub immediately.",
  "from": "AVI",
  "priority": "high"
}
```

### Checking the Queue Manually

```bash
cat ~/Desktop/claude-relay/instructions.json | python3 -m json.tool
```

---

## Architecture: The AVI System

This MCP server is one piece of the broader **AVI personal AI infrastructure**:

```
┌─────────────────────────────────────────────────────┐
│                     YOU                              │
└──────────────────────┬──────────────────────────────┘
                       │ talk to
┌──────────────────────▼──────────────────────────────┐
│              AVI (Claude Cowork)                     │
│   - Planning & research                              │
│   - Memory via claude-memory-mcp-server              │
│   - Delegates tasks via claude-relay-mcp-server ◄── │
└──────────────────────┬──────────────────────────────┘
                       │ relays to
┌──────────────────────▼──────────────────────────────┐
│              Claude Code                             │
│   - File operations                                  │
│   - GitHub pushes                                    │
│   - Script execution                                 │
│   - Anything terminal-based                          │
└─────────────────────────────────────────────────────┘
```

Related repos in the AVI stack:
- [`claude-memory-mcp-server`](https://github.com/miroslavostojicdev/claude-memory-mcp-server) — persistent memory across sessions
- [`marketing-skills`](https://github.com/miroslavostojicdev/marketing-skills) — deep marketing skill library for Claude

---

## Real-World Examples

**"Push my latest code to GitHub"**
> AVI sends the instruction → Claude Code commits and pushes → done in 30 seconds, no terminal needed.

**"Clone this repo, read the skills, and install them for me"**
> AVI relays the task → Claude Code clones, reads 34 files, rewrites the SKILL.md, packages the .skill zip, pushes to GitHub → AVI verifies on GitHub.

**"Rewrite this marketing skill with full depth"**
> AVI analyzes the existing version, identifies gaps, writes a detailed improvement brief → relays to Claude Code → Claude Code rewrites 600+ lines, re-packages, re-pushes.

---

## Troubleshooting

**Watcher not firing?**
- Check the log: `tail -f ~/Desktop/claude-relay/watcher.log`
- Confirm the queue file exists: `ls ~/Desktop/claude-relay/`
- Make sure Claude Code is installed: `claude --version`

**MCP server not showing up in Claude?**
- Verify the path in `claude_desktop_config.json` is absolute
- Restart Claude Desktop fully (quit from menu bar)
- Check for JSON syntax errors in the config file

**Instructions stuck as pending?**
- Make sure the watcher is running: `ps aux | grep relay-watcher`
- Check `dist/index.js` exists: `ls claude-relay-mcp-server/dist/`

---

## Security Note

The watcher runs Claude Code with `--dangerously-skip-permissions`. This is intentional — it allows fully autonomous operation without human confirmation prompts. Only run instructions from sources you trust (i.e., yourself via AVI). Never expose the relay queue to external parties.

---

## License

MIT — do whatever you want with it. Build your own AI infrastructure.

---

## Author

Built by **Miki** as part of the AVI personal AI system — a fully autonomous AI infrastructure where Claude Cowork and Claude Code work together as a team, with the human in the loop only when they choose to be.

> *"The goal isn't to automate tasks. It's to free up your brain for the stuff that actually matters."*

---

⭐ If this saves you time, star the repo. If you build something cool on top of it, open a PR.
