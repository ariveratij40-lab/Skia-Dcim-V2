-- SKIA RBAC Validation Data
-- Script para crear usuarios, roles y permisos de prueba

-- ============================================
-- PERMISOS BASE
-- ============================================

INSERT INTO permissions (id, name, module, action) VALUES
-- Admin permissions
('perm_admin_all', 'admin', 'admin', 'all'),

-- Infrastructure permissions
('perm_view_infrastructure', 'view_infrastructure', 'infraestructura', 'view'),
('perm_create_asset', 'create_asset', 'infraestructura', 'create'),
('perm_edit_asset', 'edit_asset', 'infraestructura', 'edit'),
('perm_delete_asset', 'delete_asset', 'infraestructura', 'delete'),

-- Operations permissions
('perm_view_operations', 'view_operations', 'operaciones', 'view'),
('perm_create_ticket', 'create_ticket', 'operaciones', 'create'),
('perm_edit_ticket', 'edit_ticket', 'operaciones', 'edit'),

-- Monitoring permissions
('perm_view_monitoring', 'view_monitoring', 'monitoreo', 'view'),

-- Administration permissions
('perm_admin_users', 'admin_users', 'administracion', 'users'),
('perm_admin_roles', 'admin_roles', 'administracion', 'roles'),
('perm_admin_tenants', 'admin_tenants', 'administracion', 'tenants'),

-- Settings permissions
('perm_view_settings', 'view_settings', 'configuracion', 'view'),
('perm_edit_settings', 'edit_settings', 'configuracion', 'edit')
ON CONFLICT DO NOTHING;

-- ============================================
-- ROLES
-- ============================================

INSERT INTO roles (id, name, description, tenant_id, is_global) VALUES
-- Global roles
('role_global_superadmin', 'Global Super Admin', 'Super administrador global', NULL, true),
('role_global_admin', 'Global Admin', 'Administrador global', NULL, true),

-- Tenant roles
('role_tenant_admin_acme', 'Tenant Admin ACME', 'Administrador de ACME Corporation', 'tenant_acme', false),
('role_tenant_operator_acme', 'Operator ACME', 'Operador de ACME Corporation', 'tenant_acme', false),
('role_tenant_viewer_acme', 'Viewer ACME', 'Visualizador de ACME Corporation', 'tenant_acme', false)
ON CONFLICT DO NOTHING;

-- ============================================
-- ROLE PERMISSIONS
-- ============================================

-- Global Super Admin: todos los permisos
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role_global_superadmin', 'perm_admin_all'),
('role_global_superadmin', 'perm_view_infrastructure'),
('role_global_superadmin', 'perm_create_asset'),
('role_global_superadmin', 'perm_edit_asset'),
('role_global_superadmin', 'perm_delete_asset'),
('role_global_superadmin', 'perm_view_operations'),
('role_global_superadmin', 'perm_create_ticket'),
('role_global_superadmin', 'perm_edit_ticket'),
('role_global_superadmin', 'perm_view_monitoring'),
('role_global_superadmin', 'perm_admin_users'),
('role_global_superadmin', 'perm_admin_roles'),
('role_global_superadmin', 'perm_admin_tenants'),
('role_global_superadmin', 'perm_view_settings'),
('role_global_superadmin', 'perm_edit_settings'),

-- Tenant Admin: permisos administrativos del tenant
('role_tenant_admin_acme', 'perm_view_infrastructure'),
('role_tenant_admin_acme', 'perm_create_asset'),
('role_tenant_admin_acme', 'perm_edit_asset'),
('role_tenant_admin_acme', 'perm_delete_asset'),
('role_tenant_admin_acme', 'perm_view_operations'),
('role_tenant_admin_acme', 'perm_create_ticket'),
('role_tenant_admin_acme', 'perm_edit_ticket'),
('role_tenant_admin_acme', 'perm_view_monitoring'),
('role_tenant_admin_acme', 'perm_admin_users'),
('role_tenant_admin_acme', 'perm_admin_roles'),
('role_tenant_admin_acme', 'perm_view_settings'),
('role_tenant_admin_acme', 'perm_edit_settings'),

-- Operator: permisos operacionales
('role_tenant_operator_acme', 'perm_view_infrastructure'),
('role_tenant_operator_acme', 'perm_create_asset'),
('role_tenant_operator_acme', 'perm_edit_asset'),
('role_tenant_operator_acme', 'perm_view_operations'),
('role_tenant_operator_acme', 'perm_create_ticket'),
('role_tenant_operator_acme', 'perm_edit_ticket'),
('role_tenant_operator_acme', 'perm_view_monitoring'),

-- Viewer: solo lectura
('role_tenant_viewer_acme', 'perm_view_infrastructure'),
('role_tenant_viewer_acme', 'perm_view_operations'),
('role_tenant_viewer_acme', 'perm_view_monitoring'),
('role_tenant_viewer_acme', 'perm_view_settings')
ON CONFLICT DO NOTHING;

-- ============================================
-- USUARIOS DE PRUEBA
-- ============================================

INSERT INTO users (id, email, name, password_hash, tenant_id, is_active) VALUES
-- Global users
('user_global_superadmin', 'superadmin@skia.local', 'Global Super Admin', '$2a$10$...', NULL, true),
('user_global_admin', 'admin@skia.local', 'Global Admin', '$2a$10$...', NULL, true),

-- ACME Tenant users
('user_tenant_admin', 'admin@acme.com', 'Admin User', '$2a$10$...', 'tenant_acme', true),
('user_operator', 'operator@acme.com', 'Operator User', '$2a$10$...', 'tenant_acme', true),
('user_viewer', 'viewer@acme.com', 'Viewer User', '$2a$10$...', 'tenant_acme', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- USER ROLES
-- ============================================

INSERT INTO user_roles (user_id, role_id, tenant_id, branch_id) VALUES
-- Global users
('user_global_superadmin', 'role_global_superadmin', NULL, NULL),
('user_global_admin', 'role_global_admin', NULL, NULL),

-- ACME Tenant users
('user_tenant_admin', 'role_tenant_admin_acme', 'tenant_acme', NULL),
('user_operator', 'role_tenant_operator_acme', 'tenant_acme', 'branch_miami'),
('user_viewer', 'role_tenant_viewer_acme', 'tenant_acme', 'branch_miami')
ON CONFLICT DO NOTHING;

-- ============================================
-- FEATURE FLAGS DE PRUEBA
-- ============================================

INSERT INTO feature_flags (id, name, description, module, tenant_id, environment, enabled, percentage, config) VALUES
-- Global flags
('flag_monitoring', 'Monitoring Module', 'Enable monitoring module', 'monitoreo', NULL, 'staging', true, 100, '{}'),
('flag_capex', 'CAPEX Module', 'Enable CAPEX module', 'capex', NULL, 'staging', true, 100, '{}'),
('flag_ai_assistant', 'AI Assistant', 'Enable AI assistant', 'asistente_ia', NULL, 'staging', false, 0, '{}'),

-- Tenant-specific flags
('flag_monitoring_acme', 'Monitoring ACME', 'Enable monitoring for ACME', 'monitoreo', 'tenant_acme', 'staging', true, 100, '{}'),
('flag_capex_acme', 'CAPEX ACME', 'Enable CAPEX for ACME', 'capex', 'tenant_acme', 'staging', false, 0, '{}')
ON CONFLICT DO NOTHING;

-- ============================================
-- VALIDACIÓN
-- ============================================

-- Verificar que los datos se insertaron correctamente
SELECT 'Permissions' as entity, COUNT(*) as count FROM permissions
UNION ALL
SELECT 'Roles', COUNT(*) FROM roles
UNION ALL
SELECT 'Role Permissions', COUNT(*) FROM role_permissions
UNION ALL
SELECT 'Users', COUNT(*) FROM users
UNION ALL
SELECT 'User Roles', COUNT(*) FROM user_roles
UNION ALL
SELECT 'Feature Flags', COUNT(*) FROM feature_flags;
