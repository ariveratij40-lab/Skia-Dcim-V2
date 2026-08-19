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
)

type branchSelectionHarness struct {
	userID        string
	tenantID      string
	allowed       map[string]bool
	authorizeErr  error
	updateCalled  bool
	updatedBranch string
	updateResult  bool
}

func (h *branchSelectionHarness) deps() branchSelectionDeps {
	return branchSelectionDeps{
		loadSession: func(string, int64) (string, string, error) {
			return h.userID, h.tenantID, nil
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
			if h.updateResult {
				h.updatedBranch = branchID
			}
			return h.updateResult, nil
		},
	}
}

func executeBranchSelection(h *branchSelectionHarness, branchID string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/select-branch", strings.NewReader(`{"branchId":"`+branchID+`"}`))
	req.AddCookie(&http.Cookie{Name: "session_token", Value: "redacted-test-token"})
	rec := httptest.NewRecorder()
	handleSelectBranchWithDeps(rec, req, h.deps())
	return rec
}

func TestSelectBranchOperatorA1Allowed(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updateResult: true}
	rec := executeBranchSelection(h, testBranchA1)
	if rec.Code != http.StatusOK || h.updatedBranch != testBranchA1 {
		t.Fatalf("A1 mapped selection: status=%d branch=%q", rec.Code, h.updatedBranch)
	}
}

func TestSelectBranchOperatorA2DeniedWithoutMutation(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updatedBranch: testBranchA1, updateResult: true}
	rec := executeBranchSelection(h, testBranchA2)
	if rec.Code != http.StatusForbidden || h.updateCalled || h.updatedBranch != testBranchA1 {
		t.Fatalf("A2 denial mutated context: status=%d update=%v branch=%q", rec.Code, h.updateCalled, h.updatedBranch)
	}
}

func TestSelectBranchMultiA1A2Allowed(t *testing.T) {
	for _, branchID := range []string{testBranchA1, testBranchA2} {
		h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true, testBranchA2: true}, updateResult: true}
		rec := executeBranchSelection(h, branchID)
		if rec.Code != http.StatusOK || h.updatedBranch != branchID {
			t.Fatalf("mapped multi branch %s: status=%d", branchID, rec.Code)
		}
	}
}

func TestSelectBranchCrossTenantDenied(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updateResult: true}
	rec := executeBranchSelection(h, testBranchB1)
	if rec.Code != http.StatusForbidden || h.updateCalled {
		t.Fatalf("cross-tenant branch: status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchRoleNameCannotBypassMapping(t *testing.T) {
	// The dependency contract has no role input: even an actor described by
	// callers as admin must possess the explicit user_branches mapping.
	h := &branchSelectionHarness{userID: "admin-user", tenantID: testTenantA, allowed: map[string]bool{}, updatedBranch: testBranchA1, updateResult: true}
	rec := executeBranchSelection(h, testBranchA2)
	if rec.Code != http.StatusForbidden || h.updateCalled || h.updatedBranch != testBranchA1 {
		t.Fatalf("role-name bypass detected: status=%d update=%v branch=%q", rec.Code, h.updateCalled, h.updatedBranch)
	}
}

func TestSelectBranchAuthorizationErrorFailsClosed(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{}, authorizeErr: errors.New("database unavailable"), updateResult: true}
	rec := executeBranchSelection(h, testBranchA1)
	if rec.Code != http.StatusInternalServerError || h.updateCalled {
		t.Fatalf("authorization error: status=%d update=%v", rec.Code, h.updateCalled)
	}
}

func TestSelectBranchRaceGuardDeniesZeroRowUpdate(t *testing.T) {
	h := &branchSelectionHarness{userID: testUser, tenantID: testTenantA, allowed: map[string]bool{testBranchA1: true}, updatedBranch: testBranchA2, updateResult: false}
	rec := executeBranchSelection(h, testBranchA1)
	if rec.Code != http.StatusForbidden || h.updatedBranch != testBranchA2 {
		t.Fatalf("race guard did not fail closed: status=%d branch=%q", rec.Code, h.updatedBranch)
	}
}
