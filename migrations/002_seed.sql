-- ==========================================
-- SKIA Seed Data
-- ==========================================

-- Tenants
INSERT INTO tenants (id, name, logo, status) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'ACME Corporation', '/logos/acme.png', 'active'),
('550e8400-e29b-41d4-a716-446655440002', 'Tech Solutions Inc', '/logos/tech.png', 'active'),
('550e8400-e29b-41d4-a716-446655440003', 'Global Infrastructure', '/logos/global.png', 'active')
ON CONFLICT DO NOTHING;

-- Users
-- Contraseña demo: demo123456 (hash argon2id real, generado con m=65536,t=1,p=4)
INSERT INTO users (id, email, name, password_hash, status) VALUES
('550e8400-e29b-41d4-a716-446655440101', 'admin@acme.com', 'Admin User', '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg', 'active'),
('550e8400-e29b-41d4-a716-446655440102', 'operator@acme.com', 'Operator User', '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg', 'active'),
('550e8400-e29b-41d4-a716-446655440103', 'viewer@acme.com', 'Viewer User', '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg', 'active')
ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- User-Tenant Mapping
INSERT INTO user_tenants (user_id, tenant_id) VALUES
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440001')
ON CONFLICT DO NOTHING;

-- Branches
INSERT INTO branches (id, tenant_id, name, city, status) VALUES
('550e8400-e29b-41d4-a716-446655440201', '550e8400-e29b-41d4-a716-446655440001', 'Sede Principal - Miami', 'Miami, FL', 'active'),
('550e8400-e29b-41d4-a716-446655440202', '550e8400-e29b-41d4-a716-446655440001', 'Centro de Datos - Nueva York', 'Nueva York, NY', 'active'),
('550e8400-e29b-41d4-a716-446655440203', '550e8400-e29b-41d4-a716-446655440001', 'Oficina Regional - Texas', 'Dallas, TX', 'active')
ON CONFLICT DO NOTHING;

-- User-Branch Mapping
INSERT INTO user_branches (user_id, branch_id) VALUES
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440201'),
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440202'),
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440203'),
('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440201'),
('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440202'),
('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440201')
ON CONFLICT DO NOTHING;

-- Roles
INSERT INTO roles (id, tenant_id, name, description, is_global) VALUES
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440001', 'admin', 'Administrador del Tenant', FALSE),
('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440001', 'operator', 'Operador de Infraestructura', FALSE),
('550e8400-e29b-41d4-a716-446655440303', '550e8400-e29b-41d4-a716-446655440001', 'viewer', 'Visualizador de Solo Lectura', FALSE),
('550e8400-e29b-41d4-a716-446655440304', NULL, 'super_admin', 'Super Administrador Global', TRUE)
ON CONFLICT DO NOTHING;

-- Permissions
INSERT INTO permissions (id, code, name, description, module, is_global) VALUES
('550e8400-e29b-41d4-a716-446655440401', 'dcim:view', 'Ver DCIM', 'Acceso a módulo DCIM', 'dcim', FALSE),
('550e8400-e29b-41d4-a716-446655440402', 'dcim:asset:create', 'Crear Activos', 'Crear nuevos activos', 'dcim', FALSE),
('550e8400-e29b-41d4-a716-446655440403', 'dcim:asset:edit', 'Editar Activos', 'Editar activos existentes', 'dcim', FALSE),
('550e8400-e29b-41d4-a716-446655440404', 'dcim:asset:delete', 'Eliminar Activos', 'Eliminar activos', 'dcim', FALSE),
('550e8400-e29b-41d4-a716-446655440405', 'admin:users', 'Gestionar Usuarios', 'Crear, editar, eliminar usuarios', 'admin', FALSE),
('550e8400-e29b-41d4-a716-446655440406', 'admin:roles', 'Gestionar Roles', 'Crear, editar, eliminar roles', 'admin', FALSE)
ON CONFLICT DO NOTHING;

-- Role-Permission Mapping
INSERT INTO role_permissions (role_id, permission_id) VALUES
-- Admin tiene todos los permisos
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440401'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440402'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440403'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440404'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440405'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440406'),
-- Operator puede ver y editar
('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440401'),
('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440402'),
('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440403'),
-- Viewer solo puede ver
('550e8400-e29b-41d4-a716-446655440303', '550e8400-e29b-41d4-a716-446655440401')
ON CONFLICT DO NOTHING;

-- User-Role Mapping
INSERT INTO user_roles (user_id, tenant_id, role_id) VALUES
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440301'),
('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440302'),
('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440303')
ON CONFLICT DO NOTHING;

-- Sidebar Modules
INSERT INTO sidebar_modules (id, code, name, icon, path, order_index) VALUES
('550e8400-e29b-41d4-a716-446655440501', 'dashboard', 'Dashboard', 'LayoutDashboard', '/dashboard', 0),
('550e8400-e29b-41d4-a716-446655440502', 'infrastructure', 'Infraestructura', 'Building2', '/infrastructure', 1),
('550e8400-e29b-41d4-a716-446655440503', 'admin', 'Administración', 'Settings', '/admin', 99)
ON CONFLICT DO NOTHING;

-- Sidebar Module Permissions
INSERT INTO sidebar_module_permissions (sidebar_module_id, permission_id) VALUES
('550e8400-e29b-41d4-a716-446655440501', '550e8400-e29b-41d4-a716-446655440401'),
('550e8400-e29b-41d4-a716-446655440502', '550e8400-e29b-41d4-a716-446655440401'),
('550e8400-e29b-41d4-a716-446655440503', '550e8400-e29b-41d4-a716-446655440405')
ON CONFLICT DO NOTHING;

-- Feature Flags
INSERT INTO feature_flags (id, code, name, description, enabled) VALUES
('550e8400-e29b-41d4-a716-446655440601', 'dcim_module', 'DCIM Module', 'Módulo DCIM', TRUE),
('550e8400-e29b-41d4-a716-446655440602', 'cmdb_module', 'CMDB Module', 'Módulo CMDB', TRUE),
('550e8400-e29b-41d4-a716-446655440603', 'monitoring_module', 'Monitoring Module', 'Módulo de Monitoreo', FALSE)
ON CONFLICT DO NOTHING;

-- Tenant Feature Flags
INSERT INTO tenant_feature_flags (tenant_id, feature_flag_id, enabled) VALUES
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440601', TRUE),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440602', TRUE),
('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440603', FALSE)
ON CONFLICT DO NOTHING;
