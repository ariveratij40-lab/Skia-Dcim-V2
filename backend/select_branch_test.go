package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	testUser     = "user-a"
	testTenantA  = "tenant-a"
	testBranchA1 = "branch-a1"
	testBranchA2 = "branch-a2"
	testBranchB1 = "branch-b1"
	testMissing  = "branch-missing"
)

type branchSelectionHarness struct {
	userID        string
	tenantID      string
	allowed       map[string]bool
	loadErr       error
	authorizeErr  error
	updateCalled  bool
	updatedBranch string
	updateResult  bool
}

func (h *branchSelectionHarness) deps() branchSelectionDeps {
	return branchSelectionDeps{
		loadSession: func(string, int64) (string, string, error) {
			return h.userID, h.tenantID, h.loadErr
		},
		userHasBranchAccess: func(userID, tenantID, branchID string) (bool, error) {
			if h.authorizeErr != nil {
				return false, h.authorizeErr
			}
			return userID == h.userID && tenantID == h.tenantID && h.allowed[branchID], nil
		},
		updateBranch: func(_, userID, tenantID, branchID string, _ int64) (bool, error) {
			h.updateCalled = true
			if userID != h.userID || tenantID != h.tenantID || !h.allowed[branchID] {
				return false, nil
			}
			h.updatedBranch = branchID
			return h.updateResult, nil
		},
	}
}

func executeBranchSelection(h *branchSelectionHarness, branchID string, withSession bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/select-branch", strings.NewReader(`{"branchId":"`+branchID+`"}`))
	if withSession {
		req.AddCookie(&http.Cookie{Name: "session_token", Value: "redacted-test-token"})
	}
	rec := httptest.NewRecorder()
	handleSelectBranchWithDeps(rec, req, h.deps())
	return rec
}

func TestSelectBranchAuthorizedMapping(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updateResult: true}
	rec := executeBranchSelection(h, testBranchA1, true)
	if rec.Code != http.StatusOK || h.updatedBranch != testBranchA1 {
		t.Fatalf("esperaba selección autorizada de A1; status=%d branch=%q", rec.Code, h.updatedBranch)
	}
}

func TestSelectBranchSameTenantWithoutMappingIsDeniedAndUnchanged(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updatedBranch: testBranchA1, updateResult: true}
	rec := executeBranchSelection(h, testBranchA2, true)
	if rec.Code != http.StatusForbidden || h.updateCalled || h.updatedBranch != testBranchA1 {
		t.Fatalf("selección no autorizada mutó contexto; status=%d update=%v branch=%q", rec.Code, h.updateCalled, h.updatedBranch)
	}
}

func TestSelectBranchCrossTenantIsDenied(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updateResult: true}
	rec := executeBranchSelection(h, testBranchB1, true)
	if rec.Code != http.StatusForbidden || h.updateCalled {
		t.Fatalf("branch de otro tenant no fue fail-closed; status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchUnknownBranchIsDenied(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updateResult: true}
	rec := executeBranchSelection(h, testMissing, true)
	if rec.Code != http.StatusForbidden || h.updateCalled {
		t.Fatalf("branch inexistente no fue fail-closed; status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchMultiBranchMappingsAreAllowed(t *testing.T) {
	for _, branchID := range []string{testBranchA1, testBranchA2} {
		h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true, testBranchA2: true}, updateResult: true}
		rec := executeBranchSelection(h, branchID, true)
		if rec.Code != http.StatusOK || h.updatedBranch != branchID {
			t.Fatalf("branch autorizada %s rechazada; status=%d", branchID, rec.Code)
		}
	}
}

func TestSelectBranchWithoutSessionIsDenied(t *testing.T) {
	h := &branchSelectionHarness{allowed: map[string]bool{}, updateResult: true}
	rec := executeBranchSelection(h, testBranchA1, false)
	if rec.Code != http.StatusUnauthorized || h.updateCalled {
		t.Fatalf("solicitud sin sesión no fue rechazada; status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchInvalidTenantContextIsDenied(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: "", allowed: map[string]bool{}, updateResult: true}
	rec := executeBranchSelection(h, testBranchA1, true)
	if rec.Code != http.StatusUnauthorized || h.updateCalled {
		t.Fatalf("contexto tenant inválido no fue rechazado; status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchAuthorizationFailureIsFailClosed(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{}, authorizeErr: errors.New("database unavailable"), updateResult: true}
	rec := executeBranchSelection(h, testBranchA1, true)
	if rec.Code != http.StatusInternalServerError || h.updateCalled {
		t.Fatalf("error de autorización no fue fail-closed; status=%d update=%v", rec.Code, h.updateCalled)
	}
}
