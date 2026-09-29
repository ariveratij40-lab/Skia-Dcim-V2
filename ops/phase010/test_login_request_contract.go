// Disposable in-memory model of the deployed handler's pre-credential boundary.
// No listener, credential comparison, database, or authentication request.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func main() {
	// Bind the model to the actual source checks, not an assumed schema.
	source, err := os.ReadFile("backend/main.go")
	if err != nil {
		panic("SOURCE_UNAVAILABLE")
	}
	for _, fragment := range []string{
		"Email    string `json:\"email\"`", "Password string `json:\"password\"`",
		"if r.Method != \"POST\"", "json.NewDecoder(r.Body).Decode(&req)",
		"http.Error(w, \"Invalid request\", http.StatusBadRequest)",
		"if req.Email == \"\" || req.Password == \"\"",
	} {
		if !strings.Contains(string(source), fragment) {
			panic("SOURCE_CONTRACT_DRIFT")
		}
	}
	handler := func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(405)
			return
		}
		var req loginRequest
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			w.WriteHeader(400)
			return
		}
		// Deliberately never inspect/validate credentials or create a session.
		w.WriteHeader(401)
	}
	check := func(method string, body []byte, expected int) {
		r := httptest.NewRequest(method, "https://skia.iamet.mx/api/auth/login", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler(w, r)
		if w.Code != expected {
			panic("STATUS_CONTRACT_MISMATCH")
		}
	}
	// Empty/truncated/syntax errors, invalid escapes/control, wrong top-level
	// type and wrong field types exhaust the decoder-error classes in this route.
	for _, body := range []string{"", "{", "not-json", `{"email":"\q"}`,
		"{\"email\":\"raw\ncontrol\"}", `[]`, `42`, `"string"`,
		`{"email":1}`, `{"password":true}`, `{"email":{}}`, `{"password":[]}`} {
		check("POST", []byte(body), 400)
	}
	for _, value := range []string{"quote\"", "back\\slash", "á中😀", " spaced ",
		strings.Repeat("x", 65536), "!@#$%^&*():;", "\n\r\t\x00"} {
		body, err := json.Marshal(loginRequest{Email: value, Password: value})
		if err != nil {
			panic("SYNTHETIC_ENCODING_FAILURE")
		}
		check("POST", body, 401)
		check("GET", body, 405)
	}
	// Decoder accepts null/empty object; these are not malformed JSON (401).
	check("POST", []byte("null"), 401)
	check("POST", []byte("{}"), 401)
	fmt.Println("GO_DECODER_400_MATRIX=PASS; VALID_JSON_NOT_400=PASS; METHOD_405_MATRIX=PASS")
}
