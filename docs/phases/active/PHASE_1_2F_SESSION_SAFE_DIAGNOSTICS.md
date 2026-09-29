# Phase 1.2F — session acquisition safe stop diagnostics HF

Authorized base: `f34c3d840576ea2a1cfb6a86b4823ecb587b5d60`.
Scope: acquisition helper, local mocked tests, this diagnostic contract only.
No backend, migration, dependency or staged VPS bundle changes. No login,
session acquisition, retry, cleanup, production operation, V3 or LOCKSTEP.
One local commit is authorized after validation; publication is separate.

## Source and session authority

The repository dependency closure remains acquire_prewindow_session.py →
execute_prewindow_activation.py → prewindow_activation.py / p0_config_model.py.
The acquired identity and token validator and seven READS remain unchanged.
No additional repository dependency is introduced (socket, ssl and contextlib
are standard library). Acquisition does not load activation JSON or execute
activation, database or Docker functions from those imported modules.

`backend/main.go:handleLogin` selects an active user, checks the password,
inserts an opaque token in PostgreSQL `sessions`, then sets the cookie and
writes the response. `backend/postgres_session_store.go` resolves this state.
SERVER_SIDE_SESSION_MODEL=STATEFUL. The cookie is not a stateless JWT.
Session creation precedes client response validation and all local artifacts.
A timeout, malformed response, denied read, identity mismatch or filesystem
failure can therefore leave a valid server-side session without a local token.
An absent window does not prove absence of a server session. No automatic
revocation, orphan matching or deletion is introduced. A precise orphan cannot
be attributed from a generic STOP alone; future read-only correlation needs
bounded attempt evidence and separate authority for any remediation.

## Closed output and complete boundary map

STOP output contains SESSION_ACQUISITION, STOP_STAGE, STOP_REASON_CODE,
RETRY_CLASS, and SERVER_SESSION_MAY_HAVE_BEEN_CREATED. Only rejected login
responses may additionally emit HTTP_STATUS_CLASS=4XX/5XX. Never exception
text, headers, response bodies, identifiers, credentials, values or hashes.
Unknown internal exceptions and KeyboardInterrupt terminate without traceback.
Parser errors do not echo argv. --help and non-mutating plan remain available.

| Boundary | Code / treatment |
| --- | --- |
| Invalid/missing CLI identity/window | PRECHECK / INPUT_MISSING |
| Root, parent owner/mode/type, lstat failure | PRECHECK / PARENT_SECURITY_FAILURE |
| Existing destination, including dangling symlink | PRECHECK / DESTINATION_COLLISION |
| Confirmation not exact | INPUT / CONFIRMATION_REJECTED |
| EOF, interrupt, unavailable hidden input | INPUT / INPUT_INTERRUPTED |
| Empty email or password | INPUT / INPUT_MISSING |
| JSON payload/construction error | AUTH / AUTH_REQUEST_CONSTRUCTION_FAILURE |
| DNS, connection, TLS, timeout | AUTH / AUTH_DNS_FAILURE, AUTH_CONNECT_FAILURE, AUTH_TLS_FAILURE, AUTH_TIMEOUT |
| Login 4xx/5xx | AUTH / AUTH_HTTP_REJECTED + bounded status class |
| Redirect/other non-200 | AUTH / AUTH_HTTP_REJECTED; no follow |
| Oversized/malformed response, cookie parse, transport protocol | AUTH / AUTH_RESPONSE_INVALID |
| Cookie secure/HttpOnly/path mismatch | AUTH / AUTH_RESPONSE_CONTRACT_MISMATCH |
| Missing/duplicate/invalid token | AUTH / TOKEN_OR_SESSION_MISSING |
| Missing/invalid/out-of-range cookie lifetime | AUTH / SESSION_EXPIRATION_FAILURE |
| Reviewed read transport/status/JSON/schema error | READS / POST_LOGIN_VALIDATION_FAILURE |
| Authenticated user/tenant/branch mismatch | READS / IDENTITY_MISMATCH, TENANT_MISMATCH, BRANCH_MISMATCH |
| mkdir/open/write/flush/fsync/close failure | ARTIFACT / ARTIFACT_CREATE_FAILURE |
| Created directory/file owner/mode/type/link violation | ARTIFACT / ARTIFACT_SECURITY_FAILURE |
| Written size or path/inode mismatch | ARTIFACT / ARTIFACT_VALIDATION_FAILURE |
| Anything not classified | INTERNAL / UNEXPECTED_INTERNAL_ERROR |

USER_INACTIVE is deliberately not disclosed: inactive/nonexistent/wrong-password
cases share the existing public rejection contract. No response-body parsing to
distinguish these facts. Likewise an expired server session rejected during reads
is POST_LOGIN_VALIDATION_FAILURE, not an inferred expiry cause.

Precheck/input failures map to OPERATOR_CORRECTION_REQUIRED and server creation
NO **for this invocation only**. AUTH/READS/ARTIFACT/INTERNAL map conservatively
to STATE_VERIFICATION_REQUIRED and UNKNOWN. UNKNOWN includes possible creation;
it never authorizes another attempt. Even transport errors and 5xx do not receive
a transient-retry classification because the client lacks independent proof of
no persistence. No automatic retry exists. Other permitted retry classes are not
emitted by this implementation. Prior attempts are not certified by this output.

## Preserved flow and fail-closed custody

Same origin, HTTP methods, hidden prompts, cookie/lifetime requirements, exact
identity, seven reads and protected filenames. No alternate authentication.
Exclusive directory and O_EXCL/O_NOFOLLOW files retained. Success now also
checks created object security and written size/inode before reporting success.
Failure retains any partial files for separate inspection; no cleanup or retry.
Root ownership and 0700/0600 are never relaxed. No success after a partial write.
Rollback is a separately reviewed source revert, not staged replacement or any
server-session/database operation. The currently staged helper is untouched.

## Local validation evidence

Mocked fault injection covers closed reason/retry output, real transport exception
dispatch, response status/body/cookie failures, input interruption, identity
differences, real main prechecks/input, exclusive artifact failures and metadata
checks. Synthetic secret markers occur only in process memory; artifact I/O is
mocked. Captured stdout/stderr contain no marker or traceback. Tests do not pass
credentials through subprocess argv, write secret fixtures, or use real endpoints.
An argv-injection test uses a deliberately synthetic invalid option to prove that
parser errors cannot echo arbitrary input; it is not credential transport.

The existing mocked success and negative tests remain applicable. Full local
tooling suite and final counts are recorded in the handoff report. A gated test
skip is not represented as executed. No claim is made about secret hygiene of an
unperformed real login, external logs, or the historical stopped attempt.
