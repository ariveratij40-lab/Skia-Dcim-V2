package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func runImportUploadStatusTest(t *testing.T, token, userID, tenantID, branchID, jobID string) *httptest.ResponseRecorder {
	t.Helper()
	mock := installInventoryRouteDBMock(t)
	expectInventoryRouteSession(mock, token, userID, tenantID, branchID)
	req := httptest.NewRequest(http.MethodGet, "/api/import/upload/status/"+jobID, nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: token})
	recorder := httptest.NewRecorder()
	handleImportUploadStatus(recorder, req)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("session expectations: %v", err)
	}
	return recorder
}

func storeImportUploadStatusForTest(t *testing.T, jobID string, status importUploadStatus) {
	t.Helper()
	importUploadStatuses.Store(jobID, status)
	t.Cleanup(func() { importUploadStatuses.Delete(jobID) })
}

func TestImportUploadStatusSameBranchPreservesResponse(t *testing.T) {
	const jobID = "same-branch-job"
	storeImportUploadStatusForTest(t, jobID, importUploadStatus{
		TenantID: "tenant-a", BranchID: "branch-a", Status: "done", Progress: 100,
		Message: "Import staged", ItemsExtracted: 3, Result: map[string]interface{}{"validItems": 2},
	})
	recorder := runImportUploadStatusTest(t, "same-branch-token", "user-a", "tenant-a", "branch-a", jobID)
	if recorder.Code != http.StatusOK {
		t.Fatalf("same-branch status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		Status         string                 `json:"status"`
		Progress       int                    `json:"progress"`
		Message        string                 `json:"message"`
		ItemsExtracted int                    `json:"itemsExtracted"`
		Result         map[string]interface{} `json:"result"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "done" || body.Progress != 100 || body.Message != "Import staged" || body.ItemsExtracted != 3 || body.Result["validItems"] != float64(2) {
		t.Fatalf("response fields changed: %+v", body)
	}
}

func TestImportUploadStatusCrossScopeIsIndistinguishableFromMissing(t *testing.T) {
	for _, tc := range []struct {
		name, tenant, branch string
	}{
		{"cross branch", "tenant-a", "branch-b"},
		{"cross tenant", "tenant-b", "branch-b"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			jobID := "scoped-job-" + tc.branch
			storeImportUploadStatusForTest(t, jobID, importUploadStatus{TenantID: "tenant-a", BranchID: "branch-a", Status: "done", Result: map[string]string{"secret": "staged"}})
			denied := runImportUploadStatusTest(t, "scope-token", "user", tc.tenant, tc.branch, jobID)
			missing := runImportUploadStatusTest(t, "missing-token", "user", tc.tenant, tc.branch, "missing-job")
			if denied.Code != http.StatusNotFound || denied.Code != missing.Code || denied.Body.String() != missing.Body.String() {
				t.Fatalf("scope disclosed existence: denied=%d/%q missing=%d/%q", denied.Code, denied.Body.String(), missing.Code, missing.Body.String())
			}
		})
	}
}

func TestImportUploadStatusMissingBranchFailsClosed(t *testing.T) {
	const jobID = "legacy-empty-branch"
	storeImportUploadStatusForTest(t, jobID, importUploadStatus{TenantID: "tenant-a", Status: "done"})
	recorder := runImportUploadStatusTest(t, "legacy-token", "user-a", "tenant-a", "branch-a", jobID)
	if recorder.Code != http.StatusNotFound || recorder.Body.String() != "Job not found\n" {
		t.Fatalf("empty branch did not fail closed: status=%d body=%q", recorder.Code, recorder.Body.String())
	}
}

func TestImportUploadStatusBranchSurvivesLifecycleUpdates(t *testing.T) {
	const jobID = "lifecycle-job"
	for _, state := range []struct {
		status string
		value  int
	}{{"created", 0}, {"processing", 50}, {"done", 100}, {"error", 100}} {
		importUploadStatuses.Store(jobID, importUploadStatus{TenantID: "tenant-a", BranchID: "branch-a", Status: state.status, Progress: state.value})
		stored, ok := importUploadStatuses.Load(jobID)
		if !ok || stored.(importUploadStatus).BranchID != "branch-a" {
			t.Fatalf("branch lost at lifecycle state %s", state.status)
		}
	}
	importUploadStatuses.Delete(jobID)
}
