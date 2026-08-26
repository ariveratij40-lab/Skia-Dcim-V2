package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

// ============================================================
// RequireTenantTx — middleware de aislamiento de tenant (C-6)
// ============================================================
//
// Envuelve un handler cuyo dominio son tablas protegidas por RLS
// (assets, asset_logs, asset_relationships, y cualquier tabla que se sume
// después). Responsabilidades:
//
//  1. Autentica la sesión y obtiene tenant_id/branch_id (vía
//     ExtractSessionContextSecure -- NUNCA se toma tenant_id/branch_id de
//     un header o del body enviado por el cliente).
//  2. Abre una transacción con BeginTenantTx (SET LOCAL app.tenant_id /
//     app.branch_id dentro de esa transacción).
//  3. Inyecta esa transacción en el contexto como TenantDB (interfaz
//     angosta, no *sql.Tx) -- el handler no puede volver a hacer
//     Begin/Commit/Rollback por su cuenta con lo que recibe.
//  4. Según el status HTTP que el handler haya escrito, hace COMMIT
//     (< 400) o ROLLBACK (>= 400). Si el handler entra en panic, hace
//     ROLLBACK y vuelve a lanzar el panic (no lo silencia).
//
// Lo que este middleware deliberadamente NO cubre (ver checklist en el
// informe de auditoría, sección C-6/C-7):
//
//   - Jobs en segundo plano, migraciones (runMigrations) y scripts de
//     ops/ -- deben declarar su propio contexto de tenant explícitamente
//     (o no tener ninguno, si la tarea es legítimamente cross-tenant, como
//     una migración de esquema corrida por un rol con privilegio).
//   - Rutas de streaming o de larga duración (p.ej. exportación de
//     reportes grandes) -- mantener una transacción abierta todo el
//     tiempo que dure un stream es un riesgo de agotamiento del pool de
//     conexiones; esas rutas necesitan una estrategia distinta (leer los
//     datos en una transacción corta con este mismo mecanismo, cerrarla,
//     y recién ahí empezar a transmitir la respuesta ya materializada).
//   - Cualquier handler que TODAVÍA use `h.DB`/`db` directamente en vez de
//     leer el TenantDB del contexto -- este middleware no reescribe el
//     cuerpo de los handlers, solo les da acceso al mecanismo correcto.
//     Ver tools/tenant_db_lint para la verificación estática de esto.
func RequireTenantTx(database *sql.DB, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessCtx := ExtractSessionContextSecure(r, database)
		if !sessCtx.Valid || sessCtx.TenantID == "" {
			respondSessionInvalid(w, sessCtx)
			return
		}

		tx, err := BeginTenantTx(r.Context(), database, sessCtx.TenantID, sessCtx.BranchID)
		if err != nil {
			log.Printf("RequireTenantTx: no se pudo abrir transacción con contexto de tenant (tenant=%s): %v", sessCtx.TenantID, err)
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}

		sw := newTransactionResponseWriter()
		ctx := withTenantDB(r.Context(), tx)
		ctx = withTenantIdentity(ctx, sessCtx.UserID, sessCtx.TenantID, sessCtx.BranchID)
		req := r.WithContext(ctx)

		finalized := false
		defer func() {
			if finalized {
				return
			}
			// Si llegamos aquí sin haber hecho commit (panic, o el flujo
			// normal decidió rollback), aseguramos que la transacción no
			// quede abierta. Rollback sobre una tx ya cerrada es un no-op
			// seguro (sql.ErrTxDone), por eso no se trata como error fatal.
			if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
				log.Printf("RequireTenantTx: error en ROLLBACK (tenant=%s): %v", sessCtx.TenantID, rbErr)
			}
			if p := recover(); p != nil {
				log.Printf("RequireTenantTx: panic en handler (tenant=%s), transacción revertida: %v", sessCtx.TenantID, p)
				panic(p) // no se silencia: se relanza para que el nivel superior decida
			}
		}()

		next(sw, req)

		if sw.status >= 400 {
			if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
				log.Printf("RequireTenantTx: error en ROLLBACK (tenant=%s): %v", sessCtx.TenantID, rbErr)
			}
			finalized = true
			sw.FlushTo(w)
			return
		}
		if cErr := tx.Commit(); cErr != nil {
			log.Printf("RequireTenantTx: error en COMMIT (tenant=%s): %v", sessCtx.TenantID, cErr)
			finalized = true
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}
		finalized = true
		sw.FlushTo(w)
	}
}

// respondSessionInvalid traduce sessCtx.Reason (ExtractSessionContextSecure,
// import_handlers.go) al código HTTP correcto, en vez de responder 401 para
// cualquier motivo de invalidez. Distinguir importa porque no todos los
// motivos son "no autenticado":
//
//   - Sin cookie / token inválido o expirado / tenant inexistente -> 401:
//     el cliente debe volver a autenticarse.
//   - Sucursal explícita en la sesión pero no autorizada para el usuario,
//     o usuario sin ninguna sucursal autorizada en el tenant -> 403: está
//     autenticado, pero no autorizado para operar aquí.
//   - Ambigüedad de sucursal (varias autorizadas, ninguna seleccionada) ->
//     409, con la lista de opciones en el cuerpo, para que el frontend
//     pueda ofrecer un selector en vez de mostrar un error genérico.
//   - Error de base de datos durante la resolución -> 500.
func respondSessionInvalid(w http.ResponseWriter, sessCtx *SessionContextSecure) {
	w.Header().Set("Content-Type", "application/json")
	switch sessCtx.Reason {
	case SessionReasonBranchSelectionNeeded:
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":              "branch_selection_required",
			"message":            sessCtx.Error,
			"available_branches": sessCtx.AvailableBranches,
		})
	case SessionReasonBranchNotAuthorized, SessionReasonNoBranchesAssigned:
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "forbidden",
			"message": sessCtx.Error,
		})
	case SessionReasonDatabaseError:
		log.Printf("RequireTenantTx: error de base de datos resolviendo sesión: %s", sessCtx.Error)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "internal error"})
	default: // SessionReasonNoCookie, SessionReasonInvalidToken, SessionReasonNoTenant, SessionReasonTenantNotFound, o vacío
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
	}
}

// transactionResponseWriter retiene headers/status/body hasta que el
// middleware conoce el resultado de COMMIT. Así ningún handler puede anunciar
// un 2xx que luego resulte falso por un error al confirmar la transacción.
type transactionResponseWriter struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func newTransactionResponseWriter() *transactionResponseWriter {
	return &transactionResponseWriter{header: make(http.Header)}
}

func (w *transactionResponseWriter) Header() http.Header { return w.header }

func (w *transactionResponseWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
}

func (w *transactionResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		// Igual que net/http: si el handler escribe cuerpo sin llamar antes
		// a WriteHeader, el status implícito es 200.
		w.status = http.StatusOK
		w.wroteHeader = true
	}
	return w.body.Write(b)
}

func (w *transactionResponseWriter) FlushTo(destination http.ResponseWriter) {
	for key, values := range w.header {
		for _, value := range values {
			destination.Header().Add(key, value)
		}
	}
	status := w.status
	if status == 0 {
		status = http.StatusOK
	}
	destination.WriteHeader(status)
	_, _ = destination.Write(w.body.Bytes())
}
