package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCanonicalRelocationMdfIdfErrorsNeverDegradeToInternalError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		statusCode int
		code       string
	}{
		{"zone required", ErrZoneRequired, http.StatusUnprocessableEntity, "ZONE_REQUIRED"},
		{"zone not found", ErrZoneNotFound, http.StatusNotFound, "ZONE_NOT_FOUND"},
		{"invalid placement", ErrInvalidAssetPlacement, http.StatusUnprocessableEntity, "INVALID_ASSET_PLACEMENT"},
		{"invalid physical scope", ErrInvalidPhysicalScope, http.StatusConflict, "PHYSICAL_SCOPE_MISMATCH"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			writeCanonicalRelocationError(rr, tt.err)
			if rr.Code != tt.statusCode {
				t.Fatalf("status=%d want=%d body=%s", rr.Code, tt.statusCode, rr.Body.String())
			}
			if !strings.Contains(rr.Body.String(), tt.code) {
				t.Fatalf("body=%s missing %s", rr.Body.String(), tt.code)
			}
		})
	}
}

func TestCanonicalRelocationScopedNotFoundIsStable(t *testing.T) {
	rr := httptest.NewRecorder()
	writeCanonicalRelocationError(rr, ErrRelocationAssetNotFound)
	if rr.Code != http.StatusNotFound || !strings.Contains(rr.Body.String(), "ASSET_NOT_FOUND") {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if errors.Is(ErrRelocationAssetNotFound, ErrInvalidPayload) {
		t.Fatal("relocation not-found must remain distinct from payload validation")
	}
}
