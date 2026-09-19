package main

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCanonicalNomenclaturePresetFixtureMatrix(t *testing.T) {
	tests := []struct {
		assetType, prefix, contextMode, sequenceScope string
		digits                                        int
		components                                    CanonicalNomenclatureComponents
		configure                                     func(*CanonicalNomenclaturePolicy)
		want                                          string
	}{
		{"MDF", "MDF", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 3, CanonicalNomenclatureComponents{Branch: "tj", Building: "parque", Zone: "prod"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeBuilding, p.IncludeZone = true, true }, "MDF-TJ-PARQUE-PROD-001"},
		{"IDF", "IDF", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 3, CanonicalNomenclatureComponents{Branch: "tj", Building: "parque", Floor: "p02", Zone: "cal"}, func(p *CanonicalNomenclaturePolicy) {
			p.IncludeBuilding, p.IncludeFloor, p.IncludeZone = true, true, true
		}, "IDF-TJ-PARQUE-P02-CAL-001"},
		{"RACK", "RK", NomenclatureContextCanonicalDistribution, NomenclatureSequenceDistribution, 3, CanonicalNomenclatureComponents{Branch: "tj", Distribution: "MDF-TJ-PARQUE-PROD-001", DistributionLocationID: "loc-mdf"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeDistribution = true }, "RK-TJ-MDF-TJ-PARQUE-PROD-001-001"},
		{"SWITCH", "SW", NomenclatureContextCanonicalHousing, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Housing: "RK-TJ-MDF01-001"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeHousing = true }, "SW-TJ-RK-TJ-MDF01-001-0001"},
		{"UPS", "UPS", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Zone: "prod"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeZone = true }, "UPS-TJ-PROD-0001"},
		{"PDU", "PDU", NomenclatureContextCanonicalHousing, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Housing: "RK-TJ-01"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeHousing = true }, "PDU-TJ-RK-TJ-01-0001"},
		{"PATCH_PANEL", "PP", NomenclatureContextCanonicalHousing, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Housing: "RK-TJ-01"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeHousing = true }, "PP-TJ-RK-TJ-01-0001"},
		{"NODE", "ND", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Zone: "oficinas"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeZone = true }, "ND-TJ-OFICINAS-0001"},
		{"FIREWALL", "FW", NomenclatureContextCanonicalHousing, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Housing: "RK-TJ-01"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeHousing = true }, "FW-TJ-RK-TJ-01-0001"},
		{"SERVER", "SRV", NomenclatureContextCanonicalHousing, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Housing: "RK-TJ-01"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeHousing = true }, "SRV-TJ-RK-TJ-01-0001"},
		{"CCTV", "CAM", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Building: "parque", Zone: "embarques"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeBuilding, p.IncludeZone = true, true }, "CAM-TJ-PARQUE-EMBARQUES-0001"},
		{"AC_UNIT", "AC", NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, 4, CanonicalNomenclatureComponents{Branch: "tj", Building: "parque", Zone: "dc"}, func(p *CanonicalNomenclaturePolicy) { p.IncludeBuilding, p.IncludeZone = true, true }, "AC-TJ-PARQUE-DC-0001"},
	}
	for _, tt := range tests {
		t.Run(tt.assetType, func(t *testing.T) {
			policy := CanonicalNomenclaturePolicy{RuleID: "rule", AssetTypeCode: tt.assetType, Prefix: tt.prefix, Separator: "-", SequenceDigits: tt.digits, ContextMode: tt.contextMode, SequenceScope: tt.sequenceScope, IncludeBranch: true}
			tt.configure(&policy)
			tt.components.Prefix = tt.prefix
			commit, err := BuildCanonicalNomenclature(policy, tt.components, 1)
			if err != nil || commit != tt.want {
				t.Fatalf("commit=%q err=%v want=%q", commit, err, tt.want)
			}
			preview, err := BuildCanonicalNomenclatureDisplay(policy, tt.components, 1)
			if err != nil || preview != commit {
				t.Fatalf("preview=%q commit=%q err=%v", preview, commit, err)
			}
			if _, err = BuildCanonicalNomenclature(policy, CanonicalNomenclatureComponents{Prefix: strings.Repeat("X", 20), Branch: strings.Repeat("B", 50), Building: strings.Repeat("S", 50), Floor: strings.Repeat("F", 50), Zone: strings.Repeat("Z", 50), Distribution: tt.components.Distribution, Housing: tt.components.Housing, Placement: tt.components.Placement, DistributionLocationID: tt.components.DistributionLocationID, PlacementLocationID: tt.components.PlacementLocationID, CustomSegment1: strings.Repeat("A", 50), CustomSegment2: strings.Repeat("C", 50)}, 1); !errors.Is(err, ErrNomenclatureCodeTooLong) && !errors.Is(err, ErrInvalidNomenclatureComponent) {
				t.Fatalf("overflow was not rejected: %v", err)
			}
		})
	}
}

func TestCanonicalNomenclatureNormalizationAndOrdering(t *testing.T) {
	p := CanonicalNomenclaturePolicy{Prefix: "sw", Separator: "-", SequenceDigits: 3, ContextMode: NomenclatureContextCanonicalHousing, SequenceScope: NomenclatureSequenceDistribution, IncludeBranch: true, IncludeBuilding: true, IncludeFloor: true, IncludeZone: true, IncludeDistribution: true, IncludeHousing: true, CustomSegment1: "edge", CustomSegment2: "48"}
	c := CanonicalNomenclatureComponents{Prefix: "sw", Branch: "tj", Building: "parque", Floor: "p02", Zone: "prod", Distribution: "MDF-TJ-PARQUE-PROD-001", Housing: "RACK-TJ-01", DistributionLocationID: "loc-mdf", CustomSegment1: "edge", CustomSegment2: "48"}
	got, err := BuildCanonicalNomenclature(p, c, 7)
	if err != nil || got != "SW-TJ-PARQUE-P02-PROD-MDF-TJ-PARQUE-PROD-001-RACK-TJ-01-EDGE-48-007" {
		t.Fatalf("code=%q err=%v", got, err)
	}
	c.Zone = "bad-zone"
	if _, err = BuildCanonicalNomenclature(p, c, 7); !errors.Is(err, ErrInvalidNomenclatureComponent) {
		t.Fatalf("configured separator inside atomic component was accepted: %v", err)
	}
	c.Zone = "producción"
	if _, err = BuildCanonicalNomenclature(p, c, 7); !errors.Is(err, ErrInvalidNomenclatureComponent) {
		t.Fatalf("non-ASCII atomic component was accepted: %v", err)
	}
}

func TestCanonicalSequenceRouterBranchPlacementDistribution(t *testing.T) {
	for _, tt := range []struct {
		name, scope, location string
	}{
		{"branch", NomenclatureSequenceBranch, ""},
		{"placement", NomenclatureSequencePlacement, "loc-placement"},
		{"distribution", NomenclatureSequenceDistribution, "loc-distribution"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			p := CanonicalNomenclaturePolicy{RuleID: "rule", SequenceScope: tt.scope, SequenceDigits: 3, ContextMode: NomenclatureContextCanonicalZone}
			c := CanonicalNomenclatureComponents{PlacementLocationID: tt.location, DistributionLocationID: tt.location}
			if tt.scope == NomenclatureSequenceBranch {
				mock.ExpectQuery("SELECT last_seq FROM nomenclature_branch_counters").WithArgs("rule", "branch").WillReturnRows(sqlmock.NewRows([]string{"last_seq"}).AddRow(4))
			} else {
				mock.ExpectQuery("SELECT last_seq FROM nomenclature_counters").WithArgs("rule", "branch", tt.location).WillReturnRows(sqlmock.NewRows([]string{"last_seq"}).AddRow(4))
			}
			next, err := peekCanonicalSequence(context.Background(), db, p, "tenant", "branch", c)
			if err != nil || next != 5 {
				t.Fatalf("peek=%d err=%v", next, err)
			}
			if err = mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
	t.Run("absent counter previews first sequence without mutation", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		mock.ExpectQuery("SELECT last_seq FROM nomenclature_branch_counters").WithArgs("rule", "branch").WillReturnError(sql.ErrNoRows)
		next, err := peekCanonicalSequence(context.Background(), db, CanonicalNomenclaturePolicy{RuleID: "rule", SequenceScope: NomenclatureSequenceBranch}, "tenant", "branch", CanonicalNomenclatureComponents{})
		if err != nil || next != 1 {
			t.Fatalf("peek=%d err=%v", next, err)
		}
		if err = mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestCanonicalPreviewIsNonMutating(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	columns := []string{"id", "asset_type_code", "prefix", "separator", "seq_digits", "last_seq", "include_branch", "include_site", "include_floor", "include_zone", "include_distribution", "include_housing", "include_placement", "include_internal_area", "context_mode", "sequence_scope", "custom_segment_1", "custom_segment_2"}
	mock.ExpectQuery("SELECT id,asset_type_code,prefix,separator").WithArgs("tenant", "NODE", NomenclatureContextCanonicalZone).
		WillReturnRows(sqlmock.NewRows(columns).AddRow("rule", "NODE", "NODE", "-", 3, 0, true, false, false, true, false, false, false, false, NomenclatureContextCanonicalZone, NomenclatureSequenceBranch, "", ""))
	mock.ExpectQuery("SELECT code FROM branches").WithArgs("branch", "tenant").WillReturnRows(sqlmock.NewRows([]string{"code"}).AddRow("TJ"))
	mock.ExpectQuery("SELECT z.id,z.tenant_id,z.branch_id").WithArgs("zone", "tenant", "branch").WillReturnRows(sqlmock.NewRows([]string{"id", "tenant_id", "branch_id", "code", "name", "status", "building_id", "building_code", "floor_id", "floor_code", "floor_name"}).AddRow("zone", "tenant", "branch", "PROD", "Production", "active", nil, nil, nil, nil, nil))
	mock.ExpectQuery("SELECT last_seq FROM nomenclature_branch_counters").WithArgs("rule", "branch").WillReturnRows(sqlmock.NewRows([]string{"last_seq"}).AddRow(8))
	preview, err := PreviewCanonicalNomenclature(context.Background(), db, CanonicalNomenclatureInput{TenantID: "tenant", BranchID: "branch", AssetTypeCode: "NODE", ZoneID: "zone", Policy: CanonicalNomenclaturePolicy{ContextMode: NomenclatureContextCanonicalZone}})
	if err != nil {
		t.Fatal(err)
	}
	if preview.IllustrativeCode != "NODE-TJ-PROD-009" || preview.CodeTemplate != "NODE-TJ-PROD-[NEXT]" || preview.SequenceReserved || !preview.Volatile || preview.IllustrativeSequence != 9 {
		t.Fatalf("preview=%+v", preview)
	}
	if err = mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
