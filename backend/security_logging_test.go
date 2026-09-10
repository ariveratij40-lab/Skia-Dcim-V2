package main

import (
	"bytes"
	"database/sql"
	"go/ast"
	"go/parser"
	"go/token"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func captureLogs(t *testing.T, fn func()) string {
	t.Helper()
	var output bytes.Buffer
	previousWriter, previousFlags, previousPrefix := log.Writer(), log.Flags(), log.Prefix()
	log.SetOutput(&output)
	log.SetFlags(0)
	log.SetPrefix("")
	t.Cleanup(func() { log.SetOutput(previousWriter); log.SetFlags(previousFlags); log.SetPrefix(previousPrefix) })
	fn()
	return output.String()
}

func TestSessionLogsNeverExposeToken(t *testing.T) {
	const sentinel = "SENTINEL_SESSION_TOKEN_NEVER_LOG"
	tests := []struct {
		name      string
		cookie    *http.Cookie
		prepare   func(sqlmock.Sqlmock)
		wantValid bool
	}{
		{name: "valid", cookie: &http.Cookie{Name: "session_token", Value: sentinel}, wantValid: true, prepare: func(mock sqlmock.Sqlmock) {
			mock.ExpectQuery(`SELECT s.user_id, s.tenant_id, s.branch_id, u.email`).WithArgs(sentinel, sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"user_id", "tenant_id", "branch_id", "email"}).AddRow("user-1", "tenant-1", "branch-1", "user@example.invalid"))
			mock.ExpectQuery(`SELECT EXISTS\(SELECT 1 FROM tenants`).WithArgs("tenant-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
			mock.ExpectQuery(`SELECT EXISTS\(`).WithArgs("branch-1", "tenant-1", "user-1").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
		}},
		{name: "invalid", cookie: &http.Cookie{Name: "session_token", Value: sentinel}, prepare: func(mock sqlmock.Sqlmock) {
			mock.ExpectQuery(`SELECT s.user_id, s.tenant_id, s.branch_id, u.email`).WithArgs(sentinel, sqlmock.AnyArg()).WillReturnError(sql.ErrNoRows)
		}},
		{name: "missing", prepare: func(sqlmock.Sqlmock) {}},
		{name: "empty", cookie: &http.Cookie{Name: "session_token", Value: ""}, prepare: func(sqlmock.Sqlmock) {}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			tc.prepare(mock)
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			var context *SessionContextSecure
			logs := captureLogs(t, func() { context = ExtractSessionContextSecure(req, database) })
			if context.Valid != tc.wantValid {
				t.Fatalf("valid=%v want=%v reason=%s", context.Valid, tc.wantValid, context.Reason)
			}
			if strings.Contains(logs, sentinel) {
				t.Fatalf("secret appeared in logs: %q", logs)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOAuthStateMismatchLogNeverExposesState(t *testing.T) {
	const sentinel = "SENTINEL_OAUTH_STATE_NEVER_LOG"
	req := httptest.NewRequest(http.MethodGet, "/api/auth/google/callback?state="+sentinel, nil)
	req.AddCookie(&http.Cookie{Name: "oauth_state", Value: "different-state"})
	rec := httptest.NewRecorder()
	logs := captureLogs(t, func() { handleGoogleCallback(rec, req) })
	if rec.Code != http.StatusFound || !strings.Contains(rec.Header().Get("Location"), "error=state_mismatch") {
		t.Fatalf("status=%d location=%s", rec.Code, rec.Header().Get("Location"))
	}
	if strings.Contains(logs, sentinel) || strings.Contains(logs, "different-state") {
		t.Fatalf("OAuth state appeared in logs: %q", logs)
	}
}

// This source-level gate prevents direct secret-bearing identifiers or known
// authentication-material labels from being passed to the standard logger.
func TestBackendDoesNotLogSecretMaterial(t *testing.T) {
	secretIdentifier := regexp.MustCompile(`(?i)(sessiontoken|stateparam|authorizationcode|accesstoken|refreshtoken|passwordhash|password|apikey|databaseurl|redispassword|jwtsecret|resetlink)`)
	secretLiteral := regexp.MustCompile(`(?i)(session[_ ]?token|oauth[_ ]?state|authorization header|access[_ ]?token|refresh[_ ]?token|password[_ ]?hash|reset link).*(%|\[)`)
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Clean(entry.Name())
		parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			pkg, ok := sel.X.(*ast.Ident)
			if !ok || pkg.Name != "log" || (sel.Sel.Name != "Printf" && sel.Sel.Name != "Println" && sel.Sel.Name != "Print") {
				return true
			}
			for _, arg := range call.Args {
				switch value := arg.(type) {
				case *ast.Ident:
					if secretIdentifier.MatchString(value.Name) {
						t.Errorf("%s logs secret-bearing identifier %s", path, value.Name)
					}
				case *ast.BasicLit:
					if secretLiteral.MatchString(value.Value) {
						t.Errorf("%s contains secret-bearing log format %s", path, value.Value)
					}
				}
			}
			return true
		})
	}
}
