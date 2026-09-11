#!/bin/sh
# =========================================================
# Build para Cloudflare Pages / Netlify.
#
# Arma dist/ con SOLO los archivos del sitio y genera
# supabase-config.js a partir de las variables de entorno,
# que se cargan en el panel del hosting.
#
# Variables requeridas:
#   SUPABASE_URL        https://xxxx.supabase.co
#   SUPABASE_ANON_KEY   la clave publica del proyecto
#
# Local:  SUPABASE_URL=... SUPABASE_ANON_KEY=... sh tools/build.sh
# =========================================================

set -eu

# Si falta alguna variable el build falla, en vez de publicar un sitio roto
: "${SUPABASE_URL:?Falta la variable de entorno SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Falta la variable de entorno SUPABASE_ANON_KEY}"

DIST=dist

rm -rf "$DIST"
mkdir -p "$DIST"

# Solo lo que el navegador necesita. Quedan afuera a proposito el README,
# los .sql del esquema y las herramientas.
cp index.html styles.css app.js db.js "$DIST"/
cp -r img "$DIST"/img

# La config se genera en el deploy: nunca vive en el repo
cat > "$DIST"/supabase-config.js <<CONFIG
/* Generado durante el deploy por tools/build.sh. No editar a mano. */
window.SUPABASE_CONFIG = {
  URL: '${SUPABASE_URL}',
  ANON_KEY: '${SUPABASE_ANON_KEY}'
};
CONFIG

# Demo privada: que no aparezca en buscadores
cat > "$DIST"/robots.txt <<'ROBOTS'
User-agent: *
Disallow: /
ROBOTS

# Cabeceras para Cloudflare Pages (Netlify las toma de netlify.toml)
cat > "$DIST"/_headers <<'HEADERS'
/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
HEADERS

echo "dist/ listo para ${SUPABASE_URL}"
ls "$DIST"
