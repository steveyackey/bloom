# Claude CLI Event Parsing - Regression Baseline

This document captures the current broken behavior in Claude CLI event parsing.
It serves as a baseline to verify that fixes actually change behavior.

**Date:** 2026-01-23
**Commit:** test/claude-event-parsing branch
**Test File:** `tests/agents/claude-events.test.ts`

---

## Summary

| Issue | Current Output | Expected Output | Status |
|-------|---------------|-----------------|--------|
| Assistant events | Nothing displayed | Message text displayed | BROKEN |
| Result events (cost) | No cost shown | "$X.XXXX" displayed | BROKEN |
| Result events (duration) | No duration shown | Duration in seconds | BROKEN |
| System init events (model) | Model not shown | Model name displayed | BROKEN |
| Error events | "unknown" shown | Actual error message | BROKEN |
| Tool events | Works correctly | Works correctly | OK |
| Session ID | Works correctly | Works correctly | OK |

---

## Issue #1: Assistant Events - Wrong Field Path

### Problem

Code looks for `event.content` but Claude CLI actual path is `event.message.content[0].text`.

### Code Location

`src/agents/claude.ts:345-351` (renderEvent method)

```typescript
// Current buggy code:
case "assistant":
  if (event.subtype === "text" && event.content) {
    process.stdout.write(event.content);
  }
  break;
```

### Real Claude CLI Event Structure

```json
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "Hello" }
    ]
  }
}
```

### Test Results

```
Test: should extract text from message.content array (EXPECTED to FAIL)
Expected: "Hello"
Received: ""

Test: should concatenate multiple text blocks in order (EXPECTED to FAIL)
Expected: "First part. Second part."
Received: ""
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| `{"type": "assistant", "message": {"content": [{"type": "text", "text": "Hello"}]}}` | (empty string) | `Hello` |
| Multi-block event with "First part. " and "Second part." | (empty string) | `First part. Second part.` |

---

## Issue #2: Result Events - Wrong Cost Field Name

### Problem

Code looks for `event.cost_usd` but Claude CLI uses `event.total_cost_usd`.

### Code Location

`src/agents/claude.ts:362-365` (renderEvent method)

```typescript
// Current buggy code:
case "result":
  if (event.cost_usd !== undefined) {
    process.stdout.write(`\n[cost: $${event.cost_usd.toFixed(4)}]\n`);
  }
  break;
```

### Real Claude CLI Event Structure

```json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.05,
  "duration_ms": 1234
}
```

### Test Results

```
Test: should display cost from total_cost_usd field (EXPECTED to FAIL)
Expected to contain: "$0.0500"
Received: ""

Test: cost should not be undefined when total_cost_usd is present (EXPECTED to FAIL)
Expected to contain: "$0.0500"
Received: ""
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| `{"type": "result", "total_cost_usd": 0.05}` | (empty string) | `[cost: $0.0500]` |

---

## Issue #3: Result Events - Duration Not Displayed

### Problem

Claude CLI sends `duration_ms` but the current code doesn't display it at all.

### Code Location

`src/agents/claude.ts:362-365` (renderEvent method) - no handling for duration_ms

### Test Results

```
Test: should display duration in seconds (EXPECTED to FAIL)
Expected to contain: "1.2s"
Received: ""
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| `{"type": "result", "duration_ms": 1234}` | (empty string) | `[duration: 1.2s]` |

---

## Issue #4: System Init Events - Model Not Displayed

### Problem

Claude CLI sends model information in system init events, but current code doesn't display it.

### Code Location

`src/agents/claude.ts:372-376` (renderEvent method)

```typescript
// Current code only shows session_id, not model:
case "system":
  if (event.subtype === "init" && event.session_id) {
    process.stdout.write(`[session: ${event.session_id}]\n`);
  }
  break;
```

### Real Claude CLI Event Structure

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "abc123-def456-ghi789",
  "model": "claude-sonnet-4"
}
```

### Test Results

```
Test: should display model name (EXPECTED to FAIL)
Expected to contain: "claude-sonnet-4"
Received: "[session: abc123-def456-ghi789]\n"
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| System init with model "claude-sonnet-4" | `[session: abc123...]\n` | `[session: abc123...]\n[model: claude-sonnet-4]\n` |

---

## Issue #5: Error Events - Wrong Error Message Path

### Problem

Code looks for `event.content` but Claude CLI uses `event.error.message`.

### Code Location

`src/agents/claude.ts:368-370` (renderEvent method)

```typescript
// Current buggy code:
case "error":
  process.stdout.write(`\n[error: ${event.content || "unknown"}]\n`);
  break;
```

### Real Claude CLI Event Structure

```json
{
  "type": "error",
  "error": {
    "message": "Rate limited",
    "code": "rate_limit_exceeded"
  }
}
```

### Test Results

```
Test: should extract error message from error.message field (EXPECTED to FAIL)
Expected to contain: "Rate limited"
Received: "\n[error: unknown]\n"
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| `{"type": "error", "error": {"message": "Rate limited"}}` | `[error: unknown]` | `[ERROR: Rate limited]` |

---

## Issue #6: Content Block Delta Events - Not Handled

### Problem

Claude CLI sends `content_block_delta` events for streaming text, but current code doesn't handle them at all.

### Real Claude CLI Event Structure

```json
{
  "type": "content_block_delta",
  "delta": {
    "type": "text_delta",
    "text": "streaming text"
  }
}
```

### Current vs Expected Output

| Input Event | Current Output | Expected Output |
|-------------|----------------|-----------------|
| Content block delta with "streaming text" | (nothing - event type not handled) | `streaming text` |

---

## Test Log (Full Output)

```
bun test v1.3.5 (1e86cebd)

tests/agents/claude-events.test.ts:
(fail) Claude CLI Event Parsing > Assistant Message Events > should extract text from message.content array (EXPECTED to FAIL) [18.84ms]
error: expect(received).toBe(expected)
Expected: "Hello"
Received: ""

(fail) Claude CLI Event Parsing > Assistant Message Events > should concatenate multiple text blocks in order (EXPECTED to FAIL) [0.12ms]
error: expect(received).toBe(expected)
Expected: "First part. Second part."
Received: ""

(fail) Claude CLI Event Parsing > Result Events > should display cost from total_cost_usd field (EXPECTED to FAIL) [0.43ms]
error: expect(received).toContain(expected)
Expected to contain: "$0.0500"
Received: ""

(fail) Claude CLI Event Parsing > Result Events > should display duration in seconds (EXPECTED to FAIL) [0.08ms]
error: expect(received).toContain(expected)
Expected to contain: "1.2s"
Received: ""

(fail) Claude CLI Event Parsing > Result Events > cost should not be undefined when total_cost_usd is present (EXPECTED to FAIL) [0.20ms]
error: expect(received).toContain(expected)
Expected to contain: "$0.0500"
Received: ""

(fail) Claude CLI Event Parsing > System Init Events > should display model name (EXPECTED to FAIL) [0.06ms]
error: expect(received).toContain(expected)
Expected to contain: "claude-sonnet-4"
Received: "[session: abc123-def456-ghi789]\n"

(fail) Claude CLI Event Parsing > Error Events > should extract error message from error.message field (EXPECTED to FAIL) [0.07ms]
error: expect(received).toContain(expected)
Expected to contain: "Rate limited"
Received: "\n[error: unknown]\n"

 13 pass
 7 fail
 27 expect() calls
Ran 20 tests across 1 file. [109.00ms]
```

---

## Working Functionality (No Changes Needed)

### Tool Events
- Tool use events correctly display `[tool: ToolName]`
- Tool result events correctly display `[tool result]`

### Session ID Capture
- Session ID is correctly captured from system init events
- Session ID is correctly displayed as `[session: ...]`

---

## Fix Priority

1. **High Priority - Assistant Events**: This is the main output channel; nothing is displayed without this fix
2. **High Priority - Result Events (cost)**: Users need to see costs for usage tracking
3. **Medium Priority - Error Events**: Error messages are critical for debugging
4. **Medium Priority - System Init (model)**: Useful for confirming which model is being used
5. **Low Priority - Duration**: Nice to have but not critical
6. **Low Priority - Content Block Delta**: Only needed for true streaming output

---

## How to Verify Fix

After implementing fixes, run:

```bash
bun test tests/agents/claude-events.test.ts
```

All 20 tests should pass (currently 13 pass, 7 fail).
