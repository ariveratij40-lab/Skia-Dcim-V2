package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

func TestAssetNomenclatureConcurrentSequence(t *testing.T) {
	dsn := os.Getenv("ASSET_NOMENCLATURE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("ASSET_NOMENCLATURE_TEST_DATABASE_URL not set")
	}
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	tenantID, branchA, branchB, ruleID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err = database.Exec(`INSERT INTO tenants(id,name) VALUES($1,'Nomenclature integration')`, tenantID); err != nil {
		t.Fatal(err)
	}
	defer database.Exec(`DELETE FROM tenants WHERE id=$1`, tenantID)
	if _, err = database.Exec(`INSERT INTO branches(id,tenant_id,name,city) VALUES($1,$3,'A','TIJ'),($2,$3,'B','MEX')`, branchA, branchB, tenantID); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,separator,include_branch,include_location,seq_digits,reset_per_location,last_seq,active) VALUES($1,$2,'SWITCH','SW','-',false,false,4,false,0,true)`, ruleID, tenantID); err != nil {
		t.Fatal(err)
	}

	const workers = 12
	codes := make(chan string, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tx, err := database.Begin()
			if err != nil {
				errs <- err
				return
			}
			assignment, err := (&DCIMHandler{}).generateInternalCode(tx, tenantID, []string{branchA, branchB}[i%2], "SWITCH")
			if err == nil {
				_, err = tx.Exec(`INSERT INTO assets(id,tenant_id,branch_id,asset_type_id,internal_code,name,nomenclature_id,nomenclature_sequence) SELECT $1,$2,$3,id,$4,$5,$6,$7 FROM asset_types WHERE code='SWITCH'`, uuid.NewString(), tenantID, []string{branchA, branchB}[i%2], assignment.Code, fmt.Sprintf("Switch %d", i), assignment.ID, assignment.Sequence)
			}
			if err == nil {
				err = tx.Commit()
			} else {
				_ = tx.Rollback()
			}
			if err != nil {
				errs <- err
				return
			}
			codes <- assignment.Code
		}(i)
	}
	wg.Wait()
	close(errs)
	close(codes)
	for err := range errs {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for code := range codes {
		if seen[code] {
			t.Fatalf("duplicate code generated: %s", code)
		}
		seen[code] = true
	}
	if len(seen) != workers {
		t.Fatalf("generated %d unique codes, want %d", len(seen), workers)
	}

	rollbackTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	rolledBack, err := (&DCIMHandler{}).generateInternalCode(rollbackTx, tenantID, branchA, "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	_ = rollbackTx.Rollback()
	commitTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	next, err := (&DCIMHandler{}).generateInternalCode(commitTx, tenantID, branchA, "SWITCH")
	if err != nil {
		t.Fatal(err)
	}
	_ = commitTx.Rollback()
	if next.Sequence != rolledBack.Sequence {
		t.Fatalf("rollback consumed sequence: rolled back=%d next=%d", rolledBack.Sequence, next.Sequence)
	}

	otherTenant, otherBranch, otherRule := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err = database.Exec(`INSERT INTO tenants(id,name) VALUES($1,'Other tenant')`, otherTenant); err != nil {
		t.Fatal(err)
	}
	defer database.Exec(`DELETE FROM tenants WHERE id=$1`, otherTenant)
	if _, err = database.Exec(`INSERT INTO branches(id,tenant_id,name) VALUES($1,$2,'Other')`, otherBranch, otherTenant); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(`INSERT INTO naming_rules(id,tenant_id,asset_type_code,prefix,active) VALUES($1,$2,'RACK','RK',true)`, otherRule, otherTenant); err != nil {
		t.Fatal(err)
	}
	isolationTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	_, err = (&DCIMHandler{}).generateInternalCode(isolationTx, tenantID, branchA, "RACK")
	_ = isolationTx.Rollback()
	if !errors.Is(err, ErrNomenclatureRequired) {
		t.Fatalf("cross-tenant rule leaked: %v", err)
	}

	if _, err = database.Exec(`UPDATE naming_rules SET active=false WHERE id=$1`, ruleID); err != nil {
		t.Fatal(err)
	}
	inactiveTx, err := database.Begin()
	if err != nil {
		t.Fatal(err)
	}
	_, err = (&DCIMHandler{}).generateInternalCode(inactiveTx, tenantID, branchA, "SWITCH")
	_ = inactiveTx.Rollback()
	if !errors.Is(err, ErrNomenclatureRequired) {
		t.Fatalf("inactive rule accepted: %v", err)
	}
}
