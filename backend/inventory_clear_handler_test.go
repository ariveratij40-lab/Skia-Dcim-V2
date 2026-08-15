package main

import "testing"

func TestClearInventoryAuthorization(t *testing.T) {
	tests := []struct {
		name       string
		role       string
		scopeAll   bool
		passwordOK bool
		want       bool
	}{
		{name: "admin with tenant-wide scope and password", role: "admin", scopeAll: true, passwordOK: true, want: true},
		{name: "non-admin with password", role: "operator", scopeAll: false, passwordOK: true, want: false},
		{name: "admin with wrong password", role: "admin", scopeAll: true, passwordOK: false, want: false},
		{name: "admin without tenant-wide scope", role: "admin", scopeAll: false, passwordOK: true, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clearInventoryAuthorized(tt.role, tt.scopeAll, tt.passwordOK); got != tt.want {
				t.Fatalf("clearInventoryAuthorized()=%v, want %v", got, tt.want)
			}
		})
	}
}
