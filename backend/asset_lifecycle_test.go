package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func lifecycleRequest(t *testing.T, method, path string, database TenantDB, tenantID, branchID string) *http.Request {
	t.Helper()
	request := httptest.NewRequest(method, path, nil)
	ctx := withTenantDB(context.Background(), database)
	ctx = withTenantIdentity(ctx, "user-1", tenantID, branchID)
	return request.WithContext(ctx)
}

func TestDeleteAssetDecommissionsWithoutDeletingBaseOrSatellite(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	mock.ExpectQuery("SELECT status FROM assets").
		WithArgs("asset-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("active"))
	mock.ExpectExec("UPDATE assets").
		WithArgs("user-1", "asset-1", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO asset_logs").
		WithArgs("tenant-1", "asset-1", "active", "user-1").
		WillReturnResult(sqlmock.NewResult(1, 1))

	recorder := httptest.NewRecorder()
	(&DCIMHandler{}).deleteAsset(recorder, lifecycleRequest(t, http.MethodDelete, "/api/dcim/assets/asset-1", database, "tenant-1", "branch-1"), "asset-1")
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"status":"decommissioned"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteAssetIsTenantAndBranchScoped(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("SELECT status FROM assets").
		WithArgs("asset-other", "tenant-1", "branch-1").
		WillReturnError(sql.ErrNoRows)

	recorder := httptest.NewRecorder()
	(&DCIMHandler{}).deleteAsset(recorder, lifecycleRequest(t, http.MethodDelete, "/api/dcim/assets/asset-other", database, "tenant-1", "branch-1"), "asset-other")
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteAssetAuditFailureFailsClosedForTenantTxRollback(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery("SELECT status FROM assets").
		WithArgs("asset-1", "tenant-1", "branch-1").
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("active"))
	mock.ExpectExec("UPDATE assets").
		WithArgs("user-1", "asset-1", "tenant-1", "branch-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO asset_logs").
		WithArgs("tenant-1", "asset-1", "active", "user-1").
		WillReturnError(errors.New("audit unavailable"))

	recorder := httptest.NewRecorder()
	(&DCIMHandler{}).deleteAsset(recorder, lifecycleRequest(t, http.MethodDelete, "/api/dcim/assets/asset-1", database, "tenant-1", "branch-1"), "asset-1")
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestPlacementContainersFailClosedWithoutAuthorizedBranchContext(t *testing.T) {
	for _, test := range []struct {
		name    string
		handler http.HandlerFunc
		path    string
		body    string
	}{
		{name: "MDF", handler: handleMdfIdf, path: "/api/infra/mdf-idf", body: `{"type":"MDF"}`},
		{name: "IDF", handler: handleMdfIdf, path: "/api/infra/mdf-idf", body: `{"type":"IDF"}`},
		{name: "Warehouse", handler: HandlePlacements, path: "/api/dcim/placements", body: `{"type":"WAREHOUSE","name":"Almacen"}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, test.path, strings.NewReader(test.body))
			test.handler(recorder, request)
			if recorder.Code != http.StatusInternalServerError {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}
