package main

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestPostgresSessionStoreUsesCanonicalIdentitySchema(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	store := NewPostgresSessionStore(database)
	ctx := context.Background()
	now := time.Now().UTC()

	mock.ExpectQuery("SELECT id, user_id, tenant_id, branch_id, false, to_timestamp\\(expires_at\\), created_at").
		WithArgs("token-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "tenant_id", "branch_id", "revoked", "expires_at", "created_at"}).
			AddRow("session-1", "user-1", "tenant-1", "branch-1", false, now.Add(time.Hour), now))
	session, err := store.FindSessionByToken(ctx, "token-1")
	if err != nil || session.SessionID != "session-1" || session.Revoked {
		t.Fatalf("canonical session lookup: session=%#v err=%v", session, err)
	}

	mock.ExpectQuery(regexp.QuoteMeta("SELECT 1 FROM user_tenants")).
		WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	if allowed, err := store.UserHasTenantAccess(ctx, "user-1", "tenant-1"); err != nil || !allowed {
		t.Fatalf("tenant access=%v err=%v", allowed, err)
	}

	mock.ExpectQuery("FROM user_branches ub").
		WithArgs("user-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	if allowed, err := store.UserHasBranchAccess(ctx, "user-1", "tenant-1", "branch-1"); err != nil || !allowed {
		t.Fatalf("branch access=%v err=%v", allowed, err)
	}

	mock.ExpectQuery("FROM user_roles ur").
		WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"name"}).AddRow("admin"))
	roles, err := store.LoadRoles(ctx, "user-1", "tenant-1")
	if err != nil || len(roles) != 1 || roles[0] != "admin" {
		t.Fatalf("roles=%v err=%v", roles, err)
	}

	mock.ExpectQuery("SELECT DISTINCT p.code").
		WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"code"}).AddRow("inventory.read"))
	permissions, err := store.LoadPermissions(ctx, "user-1", "tenant-1")
	if err != nil || !permissions["inventory.read"] {
		t.Fatalf("permissions=%v err=%v", permissions, err)
	}

	mock.ExpectQuery("SELECT id, email, name, status <> 'active', status").
		WithArgs("user-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "email", "name", "disabled", "status"}).
			AddRow("user-1", "admin@example.test", "Admin", false, "active"))
	user, err := store.GetUserInfo(ctx, "user-1")
	if err != nil || user.Disabled || user.Status != "active" {
		t.Fatalf("user=%#v err=%v", user, err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
