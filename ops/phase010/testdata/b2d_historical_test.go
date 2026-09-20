package main

import (
	"bytes"
	"context"
	"database/sql"
	"github.com/google/uuid"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestB2dHistoricalStartup(t *testing.T) {
	if os.Getenv("B2D_STARTUP_CHILD") == "1" {
		main()
		return
	}
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestB2dHistoricalStartup$")
	cmd.Env = append(os.Environ(), "B2D_STARTUP_CHILD=1", fmtPort(port))
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if e = cmd.Start(); e != nil {
		t.Fatal(e)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	client := &http.Client{Timeout: time.Second}
	for {
		select {
		case <-done:
			t.Logf("STARTUP=EXIT_BEFORE_HTTP OUTPUT=%s", output.String())
			return
		case <-time.After(200 * time.Millisecond):
			resp, e := client.Get("http://127.0.0.1:" + itoa(port) + "/api/health")
			if e == nil {
				resp.Body.Close()
				cancel()
				<-done
				t.Logf("STARTUP=HTTP_AVAILABLE STATUS=%d", resp.StatusCode)
				return
			}
		case <-ctx.Done():
			<-done
			t.Log("STARTUP=TIMEOUT")
			return
		}
	}
}
func fmtPort(p int) string { return "PORT=" + itoa(p) }

func TestB2dHistoricalPaths(t *testing.T) {
	a, e := sql.Open("postgres", os.Getenv("NOMENCLATURE_ACCEPTANCE_ADMIN_DATABASE_URL"))
	if e != nil {
		t.Fatal(e)
	}
	defer a.Close()
	r, e := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if e != nil {
		t.Fatal(e)
	}
	defer r.Close()
	tenant, branch, user, role := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, q := range []struct {
		s string
		a []interface{}
	}{
		{`INSERT INTO tenants(id,name) VALUES($1,'historical')`, []interface{}{tenant}},
		{`INSERT INTO branches(id,tenant_id,code,name) VALUES($1,$2,'OLD','historical')`, []interface{}{branch, tenant}},
		{`INSERT INTO users(id,email,name,password_hash,status) VALUES($1,$2,'historical','test','active')`, []interface{}{user, user + "@example.invalid"}},
		{`INSERT INTO user_tenants(user_id,tenant_id) VALUES($1,$2)`, []interface{}{user, tenant}},
		{`INSERT INTO roles(id,tenant_id,name,is_global) VALUES($1,$2,'admin',false)`, []interface{}{role, tenant}},
		{`INSERT INTO user_roles(user_id,tenant_id,role_id) VALUES($1,$2,$3)`, []interface{}{user, tenant, role}},
	} {
		if _, e = a.Exec(q.s, q.a...); e != nil {
			t.Fatal(e)
		}
	}
	defer a.Exec(`DELETE FROM tenants WHERE id=$1`, tenant)
	defer a.Exec(`DELETE FROM users WHERE id=$1`, user)
	ctx := withTenantIdentity(context.Background(), user, tenant, branch)
	for _, method := range []string{"GET", "POST", "PUT"} {
		tx, e := BeginTenantTx(ctx, r, tenant, branch)
		if e != nil {
			t.Fatal(e)
		}
		endpoint := "/api/dcim/catalogs/naming-rules"
		if method == "PUT" {
			rid := uuid.NewString()
			if _, e = tx.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,seq_digits) VALUES($1,$2,'SERVER','OLD','-',4)`, rid, tenant); e != nil {
				t.Fatal(e)
			}
			endpoint += "/" + rid
		}
		req := httptest.NewRequest(method, endpoint, bytes.NewBufferString(`{"asset_type_code":"SERVER","prefix":"CHANGED","separator":"-","seq_digits":4}`)).WithContext(withTenantDB(ctx, tx))
		out := httptest.NewRecorder()
		(&DCIMHandler{}).HandleNamingRules(out, req)
		tx.Rollback()
		t.Logf("HISTORICAL_%s_STATUS=%d BODY=%s", method, out.Code, out.Body.String())
	}
	probe, e := BeginTenantTx(ctx, r, tenant, branch)
	if e != nil {
		t.Fatal(e)
	}
	v2req := httptest.NewRequest("POST", "/api/dcim/catalogs/naming-rules", bytes.NewBufferString(`{"asset_type_code":"FIREWALL","prefix":"FW","separator":"-","seq_digits":4,"include_housing":true,"context_mode":"CANONICAL_HOUSING","sequence_scope":"BRANCH"}`)).WithContext(withTenantDB(ctx, probe))
	v2out := httptest.NewRecorder()
	(&DCIMHandler{}).HandleNamingRules(v2out, v2req)
	var persistedMode string
	var persistedHousing bool
	probeErr := probe.QueryRow(`SELECT context_mode,include_housing FROM naming_rules WHERE tenant_id=$1 AND asset_type_code='FIREWALL'`, tenant).Scan(&persistedMode, &persistedHousing)
	t.Logf("HISTORICAL_V2_REQUEST_STATUS=%d PERSISTED_CONTEXT=%s PERSISTED_HOUSING=%v QUERY_ERROR=%v NOT_CERTIFIED_FOR_V2=YES", v2out.Code, persistedMode, persistedHousing, probeErr)
	probe.Rollback()
	tx, e := BeginTenantTx(ctx, r, tenant, branch)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	_, e = ReadActiveSystemNamingPresets(ctx, tx, []string{"SERVER"})
	t.Logf("V1_READER_ERROR=%v", e)
}
