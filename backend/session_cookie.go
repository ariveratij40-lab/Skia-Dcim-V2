package main

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

func sessionCookieSecureFromEnv() (bool, error) {
	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if appEnv == "production" {
		return true, nil
	}

	if configured := strings.TrimSpace(os.Getenv("SESSION_COOKIE_SECURE")); configured != "" {
		secure, err := strconv.ParseBool(configured)
		if err != nil {
			return false, fmt.Errorf("SESSION_COOKIE_SECURE must be a boolean: %w", err)
		}
		return secure, nil
	}

	switch appEnv {
	case "", "development", "dev", "local", "test":
		return false, nil
	default:
		// Unknown and deployed environments fail safe for cookie transport.
		return true, nil
	}
}

func newSessionCookie(value string) (*http.Cookie, error) {
	secure, err := sessionCookieSecureFromEnv()
	if err != nil {
		return nil, err
	}
	return &http.Cookie{
		Name:     "session_token",
		Value:    value,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
		Path:     "/",
	}, nil
}
