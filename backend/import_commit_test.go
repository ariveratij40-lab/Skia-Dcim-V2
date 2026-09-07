package main

import (
	"context"
	"encoding/json"
	"testing"
)

type commitValidationDB struct {
	TenantDB
}

func TestCanonicalCommitRejectsChangedStagedHash(t *testing.T) {
	payload := CanonicalStagingPayload{SourceRowNumber: 1, AssetTypeCode: "MDF", Name: "MDF", RawSource: map[string]interface{}{"asset_type_code": "MDF"}}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	_, err = decodeAndRevalidateImportRow(context.Background(), commitValidationDB{}, CanonicalImportScope{}, importCommitRow{Number: 1, Data: data, NormalizedHash: "stale"})
	if err == nil {
		t.Fatal("staged payload with a non-authoritative hash was accepted")
	}
}

func TestControlledImportCommitErrorDoesNotExposeDatabaseDetails(t *testing.T) {
	for _, tc := range []struct {
		message, want string
	}{
		{"duplicate key value violates unique constraint", "CANONICAL_CONFLICT"},
		{"driver connection failure", "CANONICAL_WRITE_FAILED"},
	} {
		if got := controlledImportCommitError(assertionError(tc.message)); got != tc.want {
			t.Fatalf("controlled error for %q=%q want %q", tc.message, got, tc.want)
		}
	}
}

type assertionError string

func (e assertionError) Error() string { return string(e) }
