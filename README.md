
# Township Supplier Marketplace (MVP)

Includes Driver flow (web + mobile).

## Run
```bash
cp .env.example .env
# set PayFast notify_url using ngrok

docker compose -f deployment/docker-compose.dev.yml up -d --build
```

## Driver
- Login as driver `+27000000021` / `StrongPass123!`
- Web: `/driver`
- Admin assigns deliveries at `/admin`
- Mobile: `mobile-app/App.tsx` (set API base to ngrok domain)
