#!/bin/sh
# Admin startup script - resolves _FILE environment variables before starting Next.js

set -e

# Resolve _FILE environment variables to their plain counterparts
resolve_file_env() {
  local file_var="$1"
  local target_var="$2"
  
  local file_path="${!file_var}"
  if [ -n "$file_path" ] && [ -z "${!target_var}" ]; then
    if [ -f "$file_path" ]; then
      local value
      value=$(cat "$file_path" | tr -d '\n')
      export "$target_var"="$value"
      echo "🔐 Loaded $target_var from $file_var"
    else
      echo "⚠️ Could not read $file_var at $file_path"
    fi
  fi
}

# Resolve database password
resolve_file_env POSTGRES_PASSWORD_FILE POSTGRES_PASSWORD

# Update DATABASE_URL if it contains placeholder
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q '\${POSTGRES_PASSWORD}'; then
  updated_url=$(echo "$DATABASE_URL" | sed "s/\${POSTGRES_PASSWORD}/$POSTGRES_PASSWORD/g")
  export DATABASE_URL="$updated_url"
  echo "🔐 Constructed DATABASE_URL with password"
fi

# Now start Next.js
exec "$@"
