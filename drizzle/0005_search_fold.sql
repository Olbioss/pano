-- Lowercases and folds Turkish letters to ASCII, the same way in every
-- database locale: local Postgres runs with C, CI and Neon with UTF-8. So
-- "İptal", "iptal" and "IPTAL" match, and so do "şube" and "sube".
CREATE OR REPLACE FUNCTION pano_fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN translate(lower(t), 'ÇĞİÖŞÜçğıöşüÂÎÛâîû' || U&'\0307', 'cgiosucgiosuaiuaiu');
