package main

import (
	"errors"
	"testing"
)

func TestNormalizeMdfIdfPhysicalIdentityVectors(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"MDF 01", "MDF-01"},
		{" mdf   01 ", "MDF-01"},
		{"MDF-01", "MDF-01"},
		{"--idf\tcore--", "IDF-CORE"},
		{"IDF\vCORE\f02", "IDF-CORE-02"},
		{"A.b_c/01", "A.B_C/01"},
	} {
		got, err := normalizeMdfIdfPhysicalIdentity(tc.input)
		if err != nil || got != tc.want {
			t.Fatalf("normalize %q=%q err=%v want=%q", tc.input, got, err, tc.want)
		}
	}
	for _, input := range []string{"", "   ", "MDF 01 ñ", "MDF:01", "MDF@01"} {
		if _, err := normalizeMdfIdfPhysicalIdentity(input); err == nil {
			t.Fatalf("unsupported identity %q accepted", input)
		}
	}
	if _, err := normalizeMdfIdfPhysicalIdentity("---"); !errors.Is(err, ErrPhysicalIdentityRequired) {
		t.Fatalf("dash-only err=%v", err)
	}
}
