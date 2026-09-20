package main

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

func TestNomenclatureHousingPolicyNotType(t *testing.T) {
	for _, code := range []string{"FIREWALL", "SERVER", "UPS", "NODE", "CCTV", "AC_UNIT", "MDF", "IDF", "UNLISTED"} {
		p := CanonicalNomenclaturePolicy{AssetTypeCode: code, SequenceDigits: 4, ContextMode: NomenclatureContextCanonicalZone, IncludeZone: true, SequenceScope: NomenclatureSequenceBranch}
		if h, e := resolveNomenclatureHousing(context.Background(), nil, PhysicalScope{}, p, CanonicalHousingRequest{}); e != nil || h != nil {
			t.Fatalf("%s nonhousing resolved: %v", code, e)
		}
		p.ContextMode = NomenclatureContextCanonicalHousing
		p.IncludeZone = false
		p.IncludeHousing = true
		if _, e := resolveNomenclatureHousing(context.Background(), nil, PhysicalScope{}, p, CanonicalHousingRequest{}); e != ErrInvalidAssetPlacement {
			t.Fatalf("%s housing skipped: %v", code, e)
		}
	}
	f, e := parser.ParseFile(token.NewFileSet(), "nomenclature_housing.go", nil, 0)
	if e != nil {
		t.Fatal(e)
	}
	ast.Inspect(f, func(n ast.Node) bool {
		if s, ok := n.(*ast.SelectorExpr); ok && s.Sel.Name == "AssetTypeCode" {
			t.Error("policy resolver must not dispatch by type")
		}
		return true
	})
}
