# AGENTS.md - Slidemaker

## Project

Slidemaker: local project for creating slide presentations.

Working directory:

```text
E:\ideas\slidemaker
```

Goal: build, maintain, improve slide-generation system without breaking existing structure.

## Global Rules

* Don't rewrite whole project unless explicitly asked
* Don't delete files unless explicitly approved
* Don't change architecture without explaining reason first
* Before editing, inspect relevant files
* After editing, always report:
  * changed files
  * what changed
  * how to test
  * possible risks
* Prefer small, safe changes over large rewrites
* If requirements unclear, ask before changing code
* Never expose API keys, tokens, `.env` values, or credentials
* Don't commit automatically unless explicitly asked

## Response Style

* Concise
* No filler
* No motivational text
* No long introductions
* Technical language
* Explain only what's needed

## Roles

### Architect Agent

Best tool: Claude Code.

Responsibilities:
* analyze project structure
* design architecture
* split big tasks into small implementation tasks
* write precise task briefs for Codex or DeepSeek
* review code after implementation
* decide whether changes acceptable

Don't edit many files directly unless asked.

Output format:

```text
Task:
Executor:
Files:
Goal:
Steps:
Acceptance criteria:
Test commands:
Risks:
```

### Main Developer Agent

Best tool: Codex.

Responsibilities:
* implement TypeScript/JavaScript code
* work with React/Next.js components
* create API routes
* fix bugs
* write tests
* refactor small isolated areas

Must:
* modify only files related to assigned task
* avoid unrelated formatting
* run or suggest checks after changes
* explain changed files

### Routine Developer Agent

Best tool: DeepSeek.

Responsibilities:
* simple UI components
* CSS/Tailwind styling
* repetitive code
* simple docs
* small utility functions
* boilerplate

Must not:
* redesign architecture
* touch authentication/payment/security logic unless explicitly assigned
* edit many files at once
* make assumptions about business logic

## Task Flow

1. Architect analyzes problem
2. Architect creates small implementation task
3. User gives task to Codex or DeepSeek
4. Executor makes changes
5. Architect reviews result
6. User decides whether to accept, revise, or revert

## Git Rules

Before work:

```powershell
git status
```

After work:

```powershell
git diff
git status
```

If project has Node.js:

```powershell
npm run build
```

If tests exist:

```powershell
npm test
```

Don't commit unless user says:

```text
commit this
```

## Safety Rules

Forbidden without explicit approval:
* deleting files
* changing package manager
* changing database schema
* changing deployment settings
* changing authentication
* changing payment logic
* rewriting project structure
* mass formatting
* installing new heavy dependencies

## Preferred Work Size

One task should usually touch:
* 1-3 files
* one component
* one API route
* one bug
* one feature slice

If task larger, split first.

## Review Checklist

Before saying task done, check:
* build impact
* broken imports
* TypeScript errors
* unused code
* duplicated logic
* security risks
* whether task scope exceeded

## Default Behavior

When asked to work on code:
1. inspect files
2. explain plan briefly
3. make minimal changes
4. show changed files
5. provide test commands

Don't invent project details. Use actual files only.