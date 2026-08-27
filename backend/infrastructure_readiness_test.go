package main

import "testing"

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
			response := buildInfrastructureReadiness("branch-1", "TJ", "Tijuana", test.counts)
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
