# Phase 1.2F — safe exact authentication status diagnostics

Authorized base: `546a00fa83153f175b38095f7838945e9c05a2a4`.
Local tooling/tests/docs only; one local commit after PASS. No publication,
VPS access, staged-helper replacement, login, credential test, session, V3 or
LOCKSTEP. This supplements the safe-stop contract without changing backend
authentication, endpoints, identity, cookies, expiry or protected artifacts.

## Request proof

The helper constructs POST `/api/auth/login` at HTTPS `skia.iamet.mx` using
`json.dumps({'email': email, 'password': password}).encode()` (UTF-8).
Only these two body field names are present. Content-Type is application/json.
Python http.client computes Content-Length from the bytes, not character count;
the captured wire has no Cookie or chunked encoding on login. No redirect follows.

Tests intercept the real stdlib connection's send method in memory, with connect
forbidden. Quotes, backslashes, Unicode, spaces, 65536-character values,
punctuation, newline, carriage return, tab and NUL survive JSON round-trip.
Controls are escaped JSON data, not header injection. Neither the helper nor the
current server contract rejects controls merely for being in JSON string data;
no new credential normalization or validation policy is introduced.

The Go in-memory handler model is tied to source schema/decoder/method fragments
in backend/main.go and stops before credential verification. Decoder errors are
the sole 400 branch: empty/truncated/invalid JSON, invalid escapes/raw controls,
wrong top-level type or field types. Valid helper-generated string fields do not
reach this branch in the model. POST cannot trigger its 405 method check.
This does not promise that a proxy cannot return 400/405 or truncate a request.
The model never runs the real auth handler or compares a password. Commands:

```sh
go run ops/phase010/test_login_request_contract.go
python3 -B -m unittest discover -s ops/phase010 -p 'test_*.py'
```

## Safe status extension

Only AUTH / AUTH_HTTP_REJECTED may carry AUTH_HTTP_STATUS. It must be an actual
Python int (not bool, float, string or object), in HTTP range 100..599. It is
printed as a decimal integer; no input coercion or response-derived free text.
Malformed transport status becomes AUTH_RESPONSE_INVALID with no status field.
Existing HTTP_STATUS_CLASS and retry codes remain unchanged. 401 remains generic;
no inference of wrong password, unknown email or account disablement is emitted.
Bodies, header values and opaque IDs never enter diagnostic structures.

## Path-aware server-session classification

Source inspection proves the **backend handler's own** 400/401 branches occur
before session insertion. A directly attributed execution of these branches
cannot create a session. However the helper sees an HTTPS response through a
reverse proxy; the integer alone does not prove which component/path produced it.
There is no trustworthy handler-origin attestation in the current response.
Consequently this HF does not infer NO merely from 400/401: AUTH responses remain
UNKNOWN / STATE_VERIFICATION_REQUIRED. Precheck/input failures still report NO
for the current invocation; post-response/read/artifact failures remain UNKNOWN.
This distinction is intentional, not a relaxation of the source-order proof.
No caller flag or response-body assertion is added to manufacture attribution.
No automatic retry, orphan cleanup or revocation occurs.

## Validation and limitations

Exact output matrix: 400,401,403,404,405,409,422,429,500. Previous timeout, DNS,
connect, TLS, malformed/oversized response, secret-sentinel, mocked success and
artifact fail-closed tests run unchanged. All requests are mocked; byte capture
and sentinels stay in memory, never argv, temp files, snapshots or logs. The test
wire is not a production request. No real credentials are requested or used.

Final local suite: 210 PASS, 1 explicitly gated skip (disposable B3B fixture).
Go decoder/method matrix PASS. Initial wire-test mock failed because patching the
stdlib class interfered with its constructor; the fixture now substitutes only
the helper's http namespace and the full suite passes. No product fix was needed.

This implementation cannot recover the historical attempt-02 status or diagnose
its credentials. A future login requires separate authorization and reviewed
tooling alignment. Rollback is a separately authorized source revert; no runtime
or database rollback applies to this local-only change.
