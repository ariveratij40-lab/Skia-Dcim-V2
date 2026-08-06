package main

import (
	"context"
	"database/sql"
	"errors"
)

// BeginTenantTx starts a request-scoped transaction with tenant context.
func BeginTenantTx(ctx context.Context, database *sql.DB, tenantID, branchID string) (*sql.Tx, error) {
	if tenantID == "" {
		return nil, errors.New("tenant context is required")
	}
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, `SELECT set_config('app.tenant_id', $1, true)`, tenantID); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if branchID != "" {
		if _, err = tx.ExecContext(ctx, `SELECT set_config('app.branch_id', $1, true)`, branchID); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	return tx, nil
}

// ============================================================
// TenantDB — interfaz restringida para consultas tenant-scoped
// (cierre de C-6: el mecanismo de contexto de tenant existía pero
// solo se usaba en un handler; esto lo hace inyectable de forma
// uniforme y evita que un handler abra su propia conexión/transacción
// sin contexto de tenant "por accidente").
// ============================================================

// TenantDB es deliberadamente angosta: NO expone Begin/Commit/Rollback ni
// el *sql.DB/*sql.Tx concretos. Un handler que solo recibe un TenantDB no
// puede abrir una segunda transacción desconectada del contexto de tenant
// que ya estableció el middleware (ver "transacciones anidadas" en
// RequireTenantTx). Si un handler necesita agrupar varias sentencias de
// forma atómica, debe hacerlo con las mismas llamadas ExecContext/
// QueryContext sobre este mismo TenantDB -- ya están dentro de UNA
// transacción (la que abrió el middleware); no hace falta ni se debe abrir
// otra.
type TenantDB interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// tenantDBCtxKey es un tipo no exportado para evitar colisiones de clave de
// contexto con otros paquetes/valores (patrón estándar de la stdlib).
type tenantDBCtxKey struct{}

// withTenantDB inyecta un TenantDB en el contexto. No exportada: solo
// RequireTenantTx (mismo paquete) debe poder poner este valor -- los
// handlers solo deben poder leerlo (TenantDBFromContext), nunca fabricar
// el suyo propio saltándose el middleware.
func withTenantDB(ctx context.Context, tdb TenantDB) context.Context {
	return context.WithValue(ctx, tenantDBCtxKey{}, tdb)
}

// TenantDBFromContext obtiene el TenantDB con contexto de tenant ya
// establecido (app.tenant_id / app.branch_id) que RequireTenantTx inyectó
// para este request. Devuelve ok=false si el handler se está ejecutando
// sin pasar por ese middleware -- en ese caso el handler NO debe caer de
// vuelta silenciosamente a `h.DB`/`db` para tablas protegidas por RLS: eso
// es exactamente el bug que causó C-6. Debe responder 500 explícitamente
// (ver ejemplo en dcim_assets.go: listAssets/getAsset).
func TenantDBFromContext(ctx context.Context) (TenantDB, bool) {
	tdb, ok := ctx.Value(tenantDBCtxKey{}).(TenantDB)
	return tdb, ok
}

// ============================================================
// Identidad de tenant/branch en el contexto -- complementa a TenantDB.
//
// Varios handlers migrados (updateAsset, deleteAsset, HandleRFID,
// HandleLocationsManage) necesitan tenant_id/branch_id como valores planos
// para construir cláusulas WHERE explícitas -- no alcanza con que la
// transacción tenga app.tenant_id seteado internamente, porque hoy (RLS
// apagado en staging tras C-6) esa cláusula WHERE explícita es la ÚNICA
// defensa real de aislamiento para tablas sin política RLS activa (p.ej.
// `locations`). Sin esto, cada handler tendría que volver a resolver la
// sesión por su cuenta (como hacía DCIMHandler.getSessionContext, con su
// propia lógica de sucursal divergente de ExtractSessionContextSecure --
// ver hallazgo de esta ronda) solo para obtener estos dos strings.
// ============================================================

type tenantIdentityCtxKey struct{}

// tenantIdentity son los IDs ya validados y autorizados por
// ExtractSessionContextSecure para este request -- nunca tomados de un
// header o del body.
type tenantIdentity struct {
	UserID   string
	TenantID string
	BranchID string
}

// withTenantIdentity inyecta user_id/tenant_id/branch_id en el contexto.
// No exportada: solo RequireTenantTx debe poder ponerlos.
func withTenantIdentity(ctx context.Context, userID, tenantID, branchID string) context.Context {
	return context.WithValue(ctx, tenantIdentityCtxKey{}, tenantIdentity{UserID: userID, TenantID: tenantID, BranchID: branchID})
}

// TenantIdentityFromContext devuelve el user_id/tenant_id/branch_id ya
// resueltos y autorizados para este request. Igual que TenantDBFromContext,
// ok=false significa que el handler se está ejecutando sin pasar por
// RequireTenantTx -- debe responder 500 explícito, no adivinar ni volver a
// consultar la sesión por su cuenta.
func TenantIdentityFromContext(ctx context.Context) (userID, tenantID, branchID string, ok bool) {
	v, ok := ctx.Value(tenantIdentityCtxKey{}).(tenantIdentity)
	if !ok {
		return "", "", "", false
	}
	return v.UserID, v.TenantID, v.BranchID, true
}
