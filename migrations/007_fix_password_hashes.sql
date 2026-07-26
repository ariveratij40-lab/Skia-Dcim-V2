-- ==========================================
-- Migración 007: Corregir hashes de contraseña
-- Los hashes anteriores eran inválidos ('$hash' literal).
-- Se actualizan con hashes argon2id reales para demo123456.
-- ==========================================

-- Actualizar hash de admin@acme.com a demo123456
UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg'
WHERE id = '550e8400-e29b-41d4-a716-446655440101'
  AND (password_hash LIKE '%$hash' OR password_hash = '');

UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg'
WHERE id = '550e8400-e29b-41d4-a716-446655440102'
  AND (password_hash LIKE '%$hash' OR password_hash = '');

UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg'
WHERE id = '550e8400-e29b-41d4-a716-446655440103'
  AND (password_hash LIKE '%$hash' OR password_hash = '');

-- También actualizar cualquier usuario con hash inválido (contiene '$hash' literal)
UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=1,p=4$a4HjH1zO6q3vrRU32GQCYA$MccUyox8HrDlUhj+uA8NP9LKbPS2zRm9EaGMRKiHoTg'
WHERE password_hash LIKE '%$hash'
   OR password_hash = ''
   OR password_hash IS NULL;
