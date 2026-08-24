package main

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

const registerPayload = `{"org_name":"Acme","name":"Admin","email":"admin@example.test","password":"secret123"}`

var registrationStatements = []string{
	`INSERT INTO tenants (id, name, logo, created_at) VALUES ($1, $2, '', NOW())`,
	`INSERT INTO users (id, email, name, password_hash, status, created_at) VALUES ($1, $2, $3, $4, 'active', NOW())`,
	`INSERT INTO branches (id, tenant_id, name, city, status, created_at) VALUES ($1, $2, $3, 'Principal', 'active', NOW())`,
	`INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)`,
	`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`,
}

func registrationRequest() *http.Request {
	return httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(registerPayload))
}

func expectEmailAvailable(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM users WHERE email = $1")).
		WithArgs("admin@example.test").
		WillReturnError(sql.ErrNoRows)
}

func expectRegistrationExec(mock sqlmock.Sqlmock, statement string, resultError error) {
	expectation := mock.ExpectExec(regexp.QuoteMeta(statement))
	switch statement {
	case registrationStatements[0]:
		expectation.WithArgs(sqlmock.AnyArg(), "Acme")
	case registrationStatements[1]:
		expectation.WithArgs(sqlmock.AnyArg(), "admin@example.test", "Admin", sqlmock.AnyArg())
	case registrationStatements[2]:
		expectation.WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), "Acme - Sede Principal")
	default:
		expectation.WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg())
	}
	if resultError != nil {
		expectation.WillReturnError(resultError)
	} else {
		expectation.WillReturnResult(sqlmock.NewResult(1, 1))
	}
}

func expectAdminRole(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("INSERT INTO roles").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("role-admin"))
}

func TestRegisterCommitsCompleteTenantAndBranchAuthorization(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	expectEmailAvailable(mock)
	mock.ExpectBegin()
	for _, statement := range registrationStatements {
		expectRegistrationExec(mock, statement, nil)
	}
	expectAdminRole(mock)
	mock.ExpectExec("INSERT INTO user_roles").
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "role-admin").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	recorder := httptest.NewRecorder()
	handleRegisterWithDB(recorder, registrationRequest(), database)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("registration status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestRegisterRollsBackEveryMandatoryProvisioningFailure(t *testing.T) {
	failurePoints := []string{"user", "branch", "user_tenants", "user_branches", "user_roles"}
	statementIndex := map[string]int{"user": 1, "branch": 2, "user_tenants": 3, "user_branches": 4}

	for _, failurePoint := range failurePoints {
		t.Run(failurePoint, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()

			expectEmailAvailable(mock)
			mock.ExpectBegin()
			lastStatement := len(registrationStatements) - 1
			if index, ok := statementIndex[failurePoint]; ok {
				lastStatement = index
			}
			for index := 0; index <= lastStatement; index++ {
				var writeError error
				if index == lastStatement && failurePoint != "user_roles" {
					writeError = errors.New("controlled provisioning failure")
				}
				expectRegistrationExec(mock, registrationStatements[index], writeError)
			}
			if failurePoint == "user_roles" {
				expectAdminRole(mock)
				mock.ExpectExec("INSERT INTO user_roles").
					WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "role-admin").
					WillReturnError(errors.New("controlled provisioning failure"))
			}
			mock.ExpectRollback()

			recorder := httptest.NewRecorder()
			handleRegisterWithDB(recorder, registrationRequest(), database)
			if recorder.Code != http.StatusInternalServerError {
				t.Fatalf("failure %s returned status=%d body=%s", failurePoint, recorder.Code, recorder.Body.String())
			}
			if strings.Contains(recorder.Body.String(), "controlled provisioning failure") {
				t.Fatal("internal database detail leaked to the client")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestRegisterDatabaseErrorDuringEmailCheckFailsClosed(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM users WHERE email = $1")).
		WithArgs("admin@example.test").
		WillReturnError(errors.New("database unavailable"))

	recorder := httptest.NewRecorder()
	handleRegisterWithDB(recorder, registrationRequest(), database)
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLoginAfterRegistrationPersistsTenantAndAuthorizedBranch(t *testing.T) {
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	previousDB := db
	db = database
	defer func() { db = previousDB }()
	t.Setenv("APP_ENV", "test")
	t.Setenv("SESSION_COOKIE_SECURE", "false")

	passwordHash := hashPassword("secret123")
	mock.ExpectQuery("SELECT id, name, password_hash FROM users").
		WithArgs("admin@example.test").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "password_hash"}).AddRow("user-1", "Admin", passwordHash))
	mock.ExpectQuery("SELECT DISTINCT t.id, t.name, t.logo").
		WithArgs("user-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "logo"}).AddRow("tenant-1", "Acme", ""))
	mock.ExpectQuery("SELECT ub.branch_id").
		WithArgs("user-1", "tenant-1").
		WillReturnRows(sqlmock.NewRows([]string{"branch_id"}).AddRow("branch-1"))
	mock.ExpectExec("INSERT INTO sessions").
		WithArgs(sqlmock.AnyArg(), "user-1", sqlmock.AnyArg(), "tenant-1", "branch-1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))

	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"admin@example.test","password":"secret123"}`))
	recorder := httptest.NewRecorder()
	handleLogin(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if len(recorder.Result().Cookies()) != 1 || recorder.Result().Cookies()[0].Secure {
		t.Fatalf("expected one non-Secure test cookie, got %#v", recorder.Result().Cookies())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
