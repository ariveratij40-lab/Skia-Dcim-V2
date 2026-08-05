package main

import (
	"database/sql"
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
			jsonErr(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		tx, err := BeginTenantTx(r.Context(), database, sessCtx.TenantID, sessCtx.BranchID)
		if err != nil {
			log.Printf("RequireTenantTx: no se pudo abrir transacción con contexto de tenant (tenant=%s): %v", sessCtx.TenantID, err)
			jsonErr(w, "Internal error", http.StatusInternalServerError)
			return
		}

		sw := &statusCapturingWriter{ResponseWriter: w}
		ctx := withTenantDB(r.Context(), tx)
		req := r.WithContext(ctx)

		committed := false
		defer func() {
			if committed {
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
			return // el defer de arriba hace el ROLLBACK
		}
		if cErr := tx.Commit(); cErr != nil {
			log.Printf("RequireTenantTx: error en COMMIT (tenant=%s): %v", sessCtx.TenantID, cErr)
			// La respuesta de éxito ya pudo haberse enviado al cliente antes
			// de este punto (p.ej. si el handler usó json.NewEncoder(w) sin
			// buffering). Esto es una condición real pero rara (falla del
			// COMMIT en sí, no de la lógica de negocio) que debe
			// monitorearse -- no hay forma de "deshacer" una respuesta ya
			// escrita al cliente en este punto.
			return
		}
		committed = true
	}
}

// statusCapturingWriter registra qué status HTTP escribió el handler, para
// que RequireTenantTx decida COMMIT (status < 400) o ROLLBACK (status >= 400)
// sin tener que cambiar la firma de cada handler para que devuelva un error.
type statusCapturingWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *statusCapturingWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusCapturingWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		// Igual que net/http: si el handler escribe cuerpo sin llamar antes
		// a WriteHeader, el status implícito es 200.
		w.status = http.StatusOK
		w.wroteHeader = true
	}
	return w.ResponseWriter.Write(b)
}
