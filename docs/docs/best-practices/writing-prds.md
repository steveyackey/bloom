---
sidebar_position: 2
title: Writing PRDs
---

# Writing Effective PRDs

The Product Requirements Document (PRD) is the foundation for AI-generated plans. Better PRDs lead to better results.

## PRD Purpose

The PRD tells Claude:
- **What** to build
- **Why** it matters
- **Constraints** to work within
- **Success** looks like

## Essential Sections

### Overview

Start with a clear summary:

```markdown
## Overview

Implement JWT-based authentication for the API, allowing users to
register, log in, and access protected resources with tokens that
expire after 24 hours.
```

**Tips:**
- One paragraph max
- State the deliverable clearly
- Include key technical choice if relevant

### Problem Statement

Explain the why:

```markdown
## Problem Statement

Currently, the API has no authentication. All endpoints are public,
which means:
- Anyone can access user data
- No way to track who made requests
- Cannot implement user-specific features

This blocks development of personalization and premium features.
```

### Requirements

Be specific and testable:

```markdown
## Requirements

### Functional Requirements
- Users can register with email and password
- Email addresses must be unique and validated
- Passwords require: 8+ chars, 1 uppercase, 1 number
- Login returns JWT access token and refresh token
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Protected endpoints return 401 without valid token
- Users can refresh tokens before expiry
- Users can log out (invalidate refresh token)

### Non-Functional Requirements
- Password hashing uses bcrypt with cost factor 12
- Rate limit: 5 login attempts per minute per IP
- Token validation < 10ms
- Support 1000 concurrent authenticated users
```

**Good requirement characteristics:**
- Specific (not "fast" but "< 10ms")
- Measurable (can verify completion)
- Independent (can be implemented separately)

### Technical Constraints

Define boundaries:

```markdown
## Technical Constraints

### Must Use
- Node.js/Express (existing stack)
- PostgreSQL (existing database)
- Existing User model (extend, don't replace)

### Cannot Use
- Third-party auth services (security policy)
- Session-based auth (stateless requirement)

### Integration Points
- Existing /users endpoints need protection
- Mobile app will use same tokens
- Admin dashboard needs separate token scope
```

### Success Criteria

Define done:

```markdown
## Success Criteria

- [ ] All auth endpoints return correct HTTP status codes
- [ ] Invalid credentials never reveal which field is wrong
- [ ] Tokens cannot be forged or modified
- [ ] Refresh flow works without user re-login
- [ ] All endpoints have integration tests
- [ ] API documentation is updated
- [ ] No security vulnerabilities in OWASP top 10
```

## Advanced Sections

### User Stories

Add context with stories:

```markdown
## User Stories

### New User Registration
As a new user, I want to create an account with my email and password,
so that I can access personalized features.

**Acceptance:**
- Form validates email format
- Password requirements shown before submit
- Error message if email taken
- Success redirects to login

### Returning User Login
As a registered user, I want to log in with my credentials,
so that I can access my account.

**Acceptance:**
- Remember me option for longer session
- Show loading state during auth
- Clear error messages for failures
```

### Edge Cases

Anticipate problems:

```markdown
## Edge Cases

### Concurrent Sessions
- User logs in from multiple devices
- Decision: Allow multiple sessions
- Each device gets unique refresh token

### Token Expiry During Request
- Long-running request, token expires mid-way
- Decision: Validate at request start only
- Frontend handles refresh proactively

### Email Change
- User changes email while logged in
- Decision: Invalidate all sessions
- Require re-authentication
```

### Out of Scope

Be explicit about boundaries:

```markdown
## Out of Scope

The following are NOT part of this project:
- Social login (OAuth) - Future project
- Two-factor authentication - Separate security initiative
- Password reset flow - Depends on email service (not ready)
- Admin role management - V2 feature

These boundaries are firm unless explicitly changed.
```

## Writing Tips

### Be Specific

```markdown
# Bad
Users can log in securely.

# Good
Users can log in with email/password. The system:
- Validates credentials against database
- Returns JWT if valid (15 min expiry)
- Returns 401 with generic error if invalid
- Locks account after 5 failed attempts
```

### Include Examples

```markdown
## API Contract

### POST /auth/login
Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

Success Response (200):
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "dGhpcyB...",
  "expiresIn": 900
}
```

Error Response (401):
```json
{
  "error": "Invalid credentials"
}
```
```

### Reference Existing Code

```markdown
## Integration Notes

### Existing User Model
Located at `src/models/User.ts`:
- Already has email and id fields
- Need to add: password_hash, created_at, updated_at
- Keep existing find/create methods

### Middleware Pattern
Follow existing pattern in `src/middleware/`:
- Export function that returns middleware
- Use consistent error format
- Log appropriately
```

## Common Mistakes

### Too Vague

```markdown
# Bad
Make authentication work.

# Good
Implement JWT authentication with:
- Registration endpoint
- Login endpoint
- Token refresh endpoint
- Middleware for protected routes
```

### Missing Constraints

```markdown
# Bad
Use any library you want.

# Good
Use bcrypt for hashing (already in package.json).
Use jsonwebtoken for JWT (already in package.json).
Do not add new dependencies without approval.
```

### No Success Criteria

```markdown
# Bad
(No success criteria section)

# Good
## Success Criteria
- All tests pass
- No TypeScript errors
- Security review approved
- Documentation updated
```

## PRD Template

```markdown
# [Feature Name]

## Overview
[2-3 sentence summary of what this feature does]

## Problem Statement
[Why this feature is needed, what problem it solves]

## Requirements

### Functional Requirements
- [ ] Requirement 1
- [ ] Requirement 2

### Non-Functional Requirements
- [ ] Performance requirement
- [ ] Security requirement

## Technical Constraints
- Must use: [technologies]
- Cannot use: [restrictions]
- Integrates with: [systems]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Out of Scope
- Item 1 (reason)
- Item 2 (reason)

## Open Questions
- Question 1?
- Question 2?
```

## Iteration

Use `bloom refine` to improve your PRD:

```bash
bloom refine
# "Add more detail about error handling"
# "What edge cases should we consider?"
# "Are there security implications?"
```

Claude will ask clarifying questions and suggest improvements.
