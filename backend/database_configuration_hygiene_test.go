package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestProductionSourceHasNoEmbeddedDatabaseCredentials(t *testing.T) {
	paths, err := filepath.Glob("*.go")
	if err != nil || len(paths) == 0 {
		t.Fatal("cannot enumerate production source")
	}
	credential := regexp.MustCompile(`postgres(?:ql)?://[^\s"']+:[^\s"']+@`)
	for _, path := range paths {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal("cannot inspect production source")
		}
		if credential.Match(data) {
			t.Errorf("embedded database credential detected in %s (value withheld)", path)
		}
	}
}

func TestDatabaseConfigurationRequiresExplicitInjection(t *testing.T) {
	for _, restricted := range []string{"true", "false", ""} {
		t.Run("missing-runtime-"+restricted, func(t *testing.T) {
			t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", restricted)
			t.Setenv("DATABASE_URL", "")
			t.Setenv("MIGRATOR_DATABASE_URL", "injected-migrator")
			t.Setenv("ONBOARDING_DATABASE_URL", "injected-onboarding")
			if _, _, _, _, err := databaseDSNsFromEnv(); err == nil {
				t.Fatal("missing runtime configuration must not select an implicit credential")
			}
		})
	}
}

func TestDatabaseConfigurationDevelopmentInjection(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "false")
	t.Setenv("DATABASE_URL", "postgres://fixture@localhost:1/disposable?sslmode=disable")
	t.Setenv("MIGRATOR_DATABASE_URL", "")
	t.Setenv("ONBOARDING_DATABASE_URL", "")
	runtime, migrator, onboarding, restricted, err := databaseDSNsFromEnv()
	if err != nil || restricted || runtime == "" || migrator != runtime || onboarding != runtime {
		t.Fatal("development must use explicitly injected configuration")
	}
}

func TestDatabaseConfigurationRestrictedRejectsImplicitRoleFallback(t *testing.T) {
	t.Setenv("SKIA_REQUIRE_RESTRICTED_RUNTIME_DB", "true")
	t.Setenv("DATABASE_URL", "postgres://fixture@localhost:1/disposable?sslmode=disable")
	t.Setenv("MIGRATOR_DATABASE_URL", "")
	t.Setenv("ONBOARDING_DATABASE_URL", "")
	if _, _, _, _, err := databaseDSNsFromEnv(); err == nil {
		t.Fatal("restricted roles must never fall back to the injected runtime identity")
	}
}
