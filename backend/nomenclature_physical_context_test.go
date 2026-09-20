package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The common completion layer must never select physical authority by asset
// type. Context mode and canonical references are its only routing inputs.
func TestCanonicalPhysicalContextHasNoAssetTypeSpecialCase(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "nomenclature_physical_context.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(f, func(n ast.Node) bool {
		if s, ok := n.(*ast.SelectorExpr); ok && s.Sel.Name == "AssetTypeCode" {
			t.Error("asset-specific physical authority introduced")
		}
		if lit, ok := n.(*ast.BasicLit); ok && lit.Kind == token.STRING && lit.Value == `"UPS"` {
			t.Error("UPS-specific context introduced")
		}
		return true
	})
}

func TestCanonicalPhysicalContextErrorsUseExisting4xx(t *testing.T) {
	for _, err := range []error{ErrZoneRequired, ErrZoneNotFound, ErrPhysicalScopeMismatch, ErrInvalidAssetPlacement} {
		r := httptest.NewRecorder()
		writeManagedAssetError(r, err, "UPS")
		if r.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%v: HTTP=%d", err, r.Code)
		}
	}
}
