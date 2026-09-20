package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
)

// The versioned typed payload is independent of map order, counter state and
// presentation JSON. RuleID, when supplied, is the expected predecessor.
func customizationFingerprint(p CanonicalNomenclaturePolicy) (string, error) {
	p.AssetTypeCode = strings.ToUpper(strings.TrimSpace(p.AssetTypeCode))
	p.Prefix = strings.ToUpper(strings.TrimSpace(p.Prefix))
	p.CustomSegment1 = strings.ToUpper(strings.TrimSpace(p.CustomSegment1))
	p.CustomSegment2 = strings.ToUpper(strings.TrimSpace(p.CustomSegment2))
	p.LastSequence = 0
	encoded, err := json.Marshal(struct {
		Version int
		Policy  CanonicalNomenclaturePolicy
	}{1, p})
	if err != nil {
		return "", ErrNomenclatureInvalidPreset
	}
	return fmt.Sprintf("%x", sha256.Sum256(encoded)), nil
}
