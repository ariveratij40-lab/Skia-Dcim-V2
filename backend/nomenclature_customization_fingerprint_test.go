package main

import (
	"reflect"
	"testing"
)

func TestCustomizationFingerprintIdentity(t *testing.T) {
	p := CanonicalNomenclaturePolicy{AssetTypeCode: "SERVER", Prefix: "SRV", Separator: "-", ContextMode: "LEGACY_INTERNAL_AREA", SequenceScope: "BRANCH", SequenceDigits: 3}
	want, err := customizationFingerprint(p)
	if err != nil {
		t.Fatal(err)
	}
	equivalent := p
	equivalent.Prefix = " srv "
	equivalent.AssetTypeCode = " server "
	equivalent.LastSequence = 999
	if got, _ := customizationFingerprint(equivalent); got != want {
		t.Fatal("noncanonical fingerprint")
	}
	// Every identity-bearing field (including both labels and predecessor) binds.
	for i := 0; i < reflect.TypeOf(p).NumField(); i++ {
		name := reflect.TypeOf(p).Field(i).Name
		if name == "LastSequence" {
			continue
		}
		changed := p
		field := reflect.ValueOf(&changed).Elem().Field(i)
		switch field.Kind() {
		case reflect.String:
			field.SetString(field.String() + "X")
		case reflect.Bool:
			field.SetBool(!field.Bool())
		case reflect.Int:
			field.SetInt(field.Int() + 1)
		default:
			t.Fatalf("uncovered field %s", name)
		}
		if got, _ := customizationFingerprint(changed); got == want {
			t.Fatalf("unbound field %s", name)
		}
	}
}
