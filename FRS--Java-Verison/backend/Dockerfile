FROM node:20-bookworm-slim

ENV NODE_ENV=development
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

ENV NODE_OPTIONS="--max-old-space-size=2048"
CMD ["sh", "-c", "node scripts/create-topics.js && node scripts/migrate.js && node -e \"const {pool} = await import('./src/db/pool.js'); const r = await pool.query('SELECT count(*)::int as c FROM frs_tenant'); if(r.rows[0].c===0){const s=await import('./scripts/seed.js'); await s.default().catch(e=>console.error(e))}else{console.log('Seed skipped: '+r.rows[0].c+' tenants exist')}; process.exit(0);\" && node src/server.js"]
