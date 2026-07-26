package main

import (
	"database/sql"
	"fmt"
	"log"
)

// ============================================================
// INICIALIZACIÓN DE SESSION STORE
// ============================================================

// InitializeSessionStore inicializa el store de sesiones con PostgreSQL
// Debe llamarse después de validar la conexión a BD
func InitializeSessionStore(database *sql.DB) error {
	if database == nil {
		return fmt.Errorf("database connection is required")
	}

	// Crear instancia de PostgresSessionStore
	store := NewPostgresSessionStore(database)
	
	// Establecer como store global
	SetSessionStore(store)
	
	log.Println("✅ SessionStore initialized with PostgreSQL")
	return nil
}

// ValidateSessionStoreInitialization valida que el store esté inicializado
// Debe llamarse antes de iniciar el servidor
func ValidateSessionStoreInitialization() error {
	if sessionStore == nil {
		return fmt.Errorf("session store was not initialized")
	}
	log.Println("✅ SessionStore validation passed")
	return nil
}
