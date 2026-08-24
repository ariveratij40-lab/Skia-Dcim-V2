package main

import "testing"

func TestSessionCookieSecurePolicy(t *testing.T) {
	tests := []struct {
		name       string
		appEnv     string
		override   string
		wantSecure bool
		wantError  bool
	}{
		{name: "production is always secure", appEnv: "production", override: "false", wantSecure: true},
		{name: "development permits HTTP", appEnv: "development", wantSecure: false},
		{name: "explicit local secure mode", appEnv: "development", override: "true", wantSecure: true},
		{name: "unknown environment fails safe", appEnv: "preview", wantSecure: true},
		{name: "malformed override fails closed", appEnv: "development", override: "sometimes", wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("APP_ENV", test.appEnv)
			t.Setenv("SESSION_COOKIE_SECURE", test.override)
			secure, err := sessionCookieSecureFromEnv()
			if (err != nil) != test.wantError {
				t.Fatalf("error=%v wantError=%v", err, test.wantError)
			}
			if !test.wantError && secure != test.wantSecure {
				t.Fatalf("secure=%v want=%v", secure, test.wantSecure)
			}
		})
	}
}

func TestSessionCookieRetainsSecurityAttributes(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	cookie, err := newSessionCookie("token")
	if err != nil {
		t.Fatal(err)
	}
	if !cookie.Secure || !cookie.HttpOnly || cookie.Path != "/" || cookie.MaxAge != 86400 {
		t.Fatalf("unexpected cookie attributes: %#v", cookie)
	}
}
