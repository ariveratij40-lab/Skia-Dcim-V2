package main

import (
	"strings"
	"testing"
)

func readinessStep(t *testing.T, response InfrastructureReadinessResponse, key string) InfrastructureReadinessStep {
	t.Helper()
	for _, step := range response.Steps {
		if step.Key == key {
			return step
		}
	}
	t.Fatalf("missing readiness step %s", key)
	return InfrastructureReadinessStep{}
}

func TestBuildInfrastructureReadinessStates(t *testing.T) {
	tests := []struct {
		name     string
		counts   infrastructureReadinessCounts
		want     map[string]string
		ready    bool
		progress int
	}{
		{"no site", infrastructureReadinessCounts{}, map[string]string{"branch": "complete", "site": "pending", "internal_area": "blocked", "mdf_idf": "blocked", "rack": "blocked"}, false, 1},
		{"site", infrastructureReadinessCounts{Sites: 1}, map[string]string{"site": "complete", "internal_area": "pending", "mdf_idf": "blocked", "rack": "blocked"}, false, 2},
		{"area", infrastructureReadinessCounts{Sites: 1, InternalAreas: 1}, map[string]string{"internal_area": "complete", "mdf_idf": "pending", "rack": "blocked"}, false, 3},
		{"distribution", infrastructureReadinessCounts{Sites: 1, InternalAreas: 1, MdfIdf: 1}, map[string]string{"mdf_idf": "complete", "rack": "available"}, true, 4},
		{"rack", infrastructureReadinessCounts{Sites: 1, InternalAreas: 1, MdfIdf: 1, ValidRacks: 1, TotalRacks: 1}, map[string]string{"rack": "complete"}, true, 4},
		{"unresolved rack", infrastructureReadinessCounts{Sites: 1, InternalAreas: 1, MdfIdf: 1, TotalRacks: 1}, map[string]string{"rack": "available"}, true, 4},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			nomenclature := buildNomenclatureReadiness("TJ", []readinessNamingRule{{AssetTypeCode: "MDF"}, {AssetTypeCode: "IDF"}})
			response := buildInfrastructureReadiness("branch-1", "TJ", "Tijuana", test.counts, nomenclature)
			if response.Ready != test.ready || response.Progress.RequiredComplete != test.progress || response.Progress.RequiredTotal != 4 || response.Progress.Percent != test.progress*25 {
				t.Fatalf("ready=%v progress=%+v", response.Ready, response.Progress)
			}
			if readinessStep(t, response, "rack").Required {
				t.Fatal("Rack changed the required baseline")
			}
			for key, want := range test.want {
				if got := readinessStep(t, response, key).Status; got != want {
					t.Fatalf("step %s=%s want %s", key, got, want)
				}
			}
			if test.name == "unresolved rack" && readinessStep(t, response, "rack").UnresolvedCount != 1 {
				t.Fatal("legacy rack was not reported unresolved")
			}
		})
	}
}

func TestBuildNomenclatureReadiness(t *testing.T) {
	rule := readinessNamingRule{AssetTypeCode: "MDF", Prefix: "MDF", Separator: "-", SeqDigits: 3,
		IncludeBranch: true, IncludeSite: true, IncludeInternalArea: true}
	partial := buildNomenclatureReadiness("PRI", []readinessNamingRule{rule})
	if partial.Status != "partial" || partial.Required || *partial.ConfiguredCount != 1 || *partial.TotalCount != 2 ||
		partial.AssetTypes[0].Status != "configured" || *partial.AssetTypes[0].Example != "MDF-PRI-[SITIO]-[AREA]-###" ||
		partial.AssetTypes[1].Status != "unavailable" || partial.AssetTypes[1].Example != nil {
		t.Fatalf("partial nomenclature=%+v", partial)
	}
	configured := buildNomenclatureReadiness("PRI", []readinessNamingRule{rule, {
		AssetTypeCode: "IDF", Prefix: "IDF", Separator: "-", SeqDigits: 3,
	}})
	if configured.Status != "configured" || configured.Required || *configured.ConfiguredCount != 2 || len(configured.Actions) != 0 {
		t.Fatalf("configured nomenclature=%+v", configured)
	}
	missing := buildNomenclatureReadiness("PRI", nil)
	if missing.Status != "unavailable" || *missing.ConfiguredCount != 0 || len(missing.AssetTypes) != 2 || len(missing.Actions) != 1 || missing.Actions[0].Target != "nomenclature_configure" {
		t.Fatalf("missing nomenclature=%+v", missing)
	}
}

func TestBuildReadinessRuleExampleMatrix(t *testing.T) {
	tests := []struct {
		name string
		rule readinessNamingRule
		want string
	}{
		{"physical hierarchy", readinessNamingRule{Prefix: "MDF", Separator: "-", SeqDigits: 3, IncludeBranch: true, IncludeSite: true, IncludeInternalArea: true}, "MDF-PRI-[SITIO]-[AREA]-###"},
		{"custom separator and segments", readinessNamingRule{Prefix: "IDF", Separator: "/", SeqDigits: 2, CustomSegment1: "Edge Core", CustomSegment2: "P 02"}, "IDF/EDGECORE/P02/##"},
		{"placement without physical hierarchy", readinessNamingRule{Prefix: "RACK", Separator: "_", SeqDigits: 4, IncludePlacement: true}, "RACK_[UBICACIÓN]_####"},
		{"branch only", readinessNamingRule{Prefix: "MDF", Separator: ".", SeqDigits: 1, IncludeBranch: true}, "MDF.PRI.#"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := buildReadinessRuleExample("PRI", test.rule); got != test.want {
				t.Fatalf("example=%q want %q", got, test.want)
			}
		})
	}
}

func TestMdfIdfActionsAreScopedByConfiguredType(t *testing.T) {
	counts := infrastructureReadinessCounts{Sites: 1, InternalAreas: 1}
	tests := []struct {
		name, status, message string
		rules                 []readinessNamingRule
		targets               []string
	}{
		{"none", "unavailable", "Configure primero", nil, nil},
		{"MDF", "partial", "Puede crear MDF", []readinessNamingRule{{AssetTypeCode: "MDF"}}, []string{"mdf_create"}},
		{"IDF", "partial", "Puede crear IDF", []readinessNamingRule{{AssetTypeCode: "IDF"}}, []string{"idf_create"}},
		{"both", "configured", "Puede crear MDF o IDF", []readinessNamingRule{{AssetTypeCode: "MDF"}, {AssetTypeCode: "IDF"}}, []string{"mdf_create", "idf_create"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			nomenclature := buildNomenclatureReadiness("PRI", test.rules)
			if nomenclature.Status != test.status {
				t.Fatalf("nomenclature status=%s", nomenclature.Status)
			}
			step := readinessStep(t, buildInfrastructureReadiness("b", "PRI", "Branch", counts, nomenclature), "mdf_idf")
			if len(step.Actions) != len(test.targets) || !strings.Contains(step.Message, test.message) {
				t.Fatalf("MDF/IDF=%+v", step)
			}
			for index, target := range test.targets {
				if step.Actions[index].Target != target {
					t.Fatalf("action[%d]=%s want %s", index, step.Actions[index].Target, target)
				}
			}
		})
	}
}

func TestNomenclatureDoesNotChangeExistingReadinessProgress(t *testing.T) {
	response := buildInfrastructureReadiness("b", "PRI", "Branch", infrastructureReadinessCounts{
		Sites: 1, InternalAreas: 1, MdfIdf: 1,
	}, buildNomenclatureReadiness("PRI", nil))
	if !response.Ready || response.Progress.RequiredComplete != 4 || response.Progress.RequiredTotal != 4 || response.Progress.Percent != 100 {
		t.Fatalf("nomenclature changed readiness baseline: %+v", response.Progress)
	}
	if step := readinessStep(t, response, "mdf_idf"); step.Status != "complete" || len(step.Actions) != 0 {
		t.Fatalf("existing MDF/IDF readiness=%+v", step)
	}
}
