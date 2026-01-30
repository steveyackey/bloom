# Interrupt Feature Investigation

## Current Behavior

When the user presses `<i>` in the bloom TUI:

1. **Key Handler Location**: `src/adapters/tui/tui.ts:993-995`
   ```typescript
   case "i":
     // Interject selected agent
     this.interjectSelectedAgent();
     break;
   ```

2. **interjectSelectedAgent Method**: `src/adapters/tui/tui.ts:1173-1202`
   - Checks if the selected pane has a running agent
   - Calls `interjectGenericSession(pane.name)` which:
     - Gets the active session from `activeSessions` Map
     - Sends `SIGTERM` to kill the agent process
     - Removes session from active sessions
     - Returns the session info (sessionId, workingDirectory)
   - Creates an interjection record via `createInterjection()` with:
     - taskId
     - sessionId
     - workingDirectory
     - reason: "User interjection from TUI"
   - Sets pane status to "idle"
   - Displays "INTERJECTED" message

3. **Generic Provider Session Tracking**: `src/agents/generic-provider.ts:74-90`
   - Active sessions are stored in a Map: `activeSessions.get(agentName)`
   - `interjectGenericSession()` kills the process with SIGTERM and removes from map

4. **Resume Flow**: After interjection, user can run:
   ```
   bloom interject resume <id>
   ```
   Which spawns a new Claude session with `--resume <sessionId>` flag.

## Problem Statement

The current flow:
1. User presses `<i>` → Agent is immediately killed
2. User must manually run `bloom interject resume <id>` to continue

The desired flow:
1. User presses `<i>` → Input box appears
2. User types a message and presses Enter
3. Message is injected into the agent's session
4. Agent continues with the new context

## Fix Location

The fix needs to be implemented in `src/adapters/tui/tui.ts`:

### 1. Add New State Variables (around line 60)
```typescript
// Interject mode state
private interjectMode = false;
private interjectInput = "";
```

### 2. Modify `handleInput` Method (line 932)
When `<i>` is pressed:
- Instead of calling `interjectSelectedAgent()` directly
- Set `interjectMode = true` and show input box
- Similar to how `answerMode` works for the questions pane

### 3. Add `handleInterjectModeInput` Method
Handle text input when in interject mode:
- Escape: Cancel and exit interject mode
- Enter: Submit the interject message
- Backspace: Delete character
- Printable chars: Append to input

### 4. Add `submitInterject` Method
When user presses Enter:
1. Stop the agent process (similar to current `interjectSelectedAgent`)
2. Create interjection record with the user's message as the reason
3. Resume the session immediately with the message injected

### 5. Modify Pane Rendering
When `interjectMode` is true for the selected pane:
- Show input box at the bottom of the pane
- Similar to how the questions pane shows the answer input

### 6. Consider Agent-Specific Injection
Different agents may have different ways to inject messages:
- Claude: Can use `--resume <sessionId>` with a new prompt
- Other agents: May need different approaches

## Key Files

| File | Purpose |
|------|---------|
| `src/adapters/tui/tui.ts` | Main TUI, key handling, interject initiation |
| `src/agents/generic-provider.ts` | Session management, process control |
| `src/human-queue.ts` | Interjection record creation/storage |
| `src/commands/interjections.ts` | CLI resume command |

## Reference: Answer Mode Implementation

The questions pane has similar functionality that can be used as a reference:
- `answerMode` boolean state (line 60)
- `answerInput` string state (line 61)
- `handleAnswerModeInput()` method (lines 1056-1076)
- `submitAnswer()` method (lines 1081-1097)
- Rendering with input box (lines 1738-1749 in `renderQuestionsPaneContent`)
