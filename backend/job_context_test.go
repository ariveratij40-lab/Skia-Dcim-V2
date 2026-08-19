package main

import "testing"

func TestJobTenantContextFailsClosed(t *testing.T) {
	tests := []struct {
		name          string
		scope         JobTenantContext
		requireBranch bool
		wantErr       bool
	}{
		{name: "missing tenant", scope: JobTenantContext{BranchID: "branch-a"}, requireBranch: true, wantErr: true},
		{name: "missing required branch", scope: JobTenantContext{TenantID: "tenant-a"}, requireBranch: true, wantErr: true},
		{name: "branch scoped", scope: JobTenantContext{TenantID: "tenant-a", BranchID: "branch-a"}, requireBranch: true},
		{name: "explicit tenant wide", scope: JobTenantContext{TenantID: "tenant-a", BranchScopeAll: true}, requireBranch: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.scope.Validate(tt.requireBranch)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error=%v, wantErr=%v", err, tt.wantErr)
			}
		})
	}
}

func TestJobScopeIsNotInferredFromMissingBranch(t *testing.T) {
	scope := JobTenantContext{TenantID: "tenant-a"}
	if scope.BranchScopeAll {
		t.Fatal("tenant-wide scope must be explicit")
	}
}
