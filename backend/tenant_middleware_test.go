package main

// Prueba unitaria pura (sin build tag, sin DB) de transactionResponseWriter: la
// pieza de la que depende RequireTenantTx para decidir COMMIT vs ROLLBACK.
// La lógica de apertura/cierre real de la transacción (BeginTenantTx,
// COMMIT/ROLLBACK contra Postgres) está cubierta por
// tenant_middleware_integration_test.go (requiere BD real, tag
// "integration") -- separarlas así permite correr esta en cada `go test`
// normal sin depender de Postgres.

import (
	"net/http/httptest"
	"testing"
)

func TestStatusCapturingWriter_ExplicitWriteHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	sw := newTransactionResponseWriter()

	sw.WriteHeader(403)

	if sw.status != 403 {
		t.Errorf("esperaba status capturado 403, obtuve %d", sw.status)
	}
	if rec.Code != 200 {
		t.Errorf("la respuesta no debe publicarse antes de FlushTo, obtuvo %d", rec.Code)
	}
	sw.FlushTo(rec)
	if rec.Code != 403 {
		t.Errorf("esperaba status publicado 403, obtuvo %d", rec.Code)
	}
}

func TestStatusCapturingWriter_ImplicitOKOnWrite(t *testing.T) {
	sw := newTransactionResponseWriter()

	// Igual que net/http: escribir sin llamar antes a WriteHeader implica 200.
	if _, err := sw.Write([]byte(`{"ok":true}`)); err != nil {
		t.Fatalf("Write no debería fallar: %v", err)
	}

	if sw.status != 200 {
		t.Errorf("esperaba status implícito 200, obtuve %d", sw.status)
	}
}

func TestStatusCapturingWriter_FirstWriteHeaderWins(t *testing.T) {
	sw := newTransactionResponseWriter()

	sw.WriteHeader(500)
	sw.WriteHeader(200) // una segunda llamada no debe "revertir" el status capturado

	if sw.status != 500 {
		t.Errorf("esperaba que prevaleciera el primer WriteHeader (500), obtuve %d", sw.status)
	}
}

func TestStatusCapturingWriter_SuccessThreshold(t *testing.T) {
	cases := []struct {
		status         int
		shouldRollback bool
	}{
		{200, false},
		{201, false},
		{204, false},
		{399, false},
		{400, true},
		{403, true},
		{404, true},
		{500, true},
	}
	for _, tc := range cases {
		sw := newTransactionResponseWriter()
		sw.WriteHeader(tc.status)
		gotRollback := sw.status >= 400 // misma condición que usa RequireTenantTx
		if gotRollback != tc.shouldRollback {
			t.Errorf("status %d: esperaba shouldRollback=%v, la condición del middleware da %v", tc.status, tc.shouldRollback, gotRollback)
		}
	}
}
