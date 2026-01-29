
# Driver Flow (Web + Mobile)

## Roles
- `driver` role accounts can:
  - View assigned deliveries (manifest)
  - Update delivery status
  - Submit Proof of Delivery (PoD)

## API
- `GET /api/driver/deliveries` (driver) -> assigned deliveries
- `GET /api/deliveries/:id` (driver/admin) -> delivery + tracking
- `PUT /api/deliveries/:id/status` (driver/admin) -> update status + tracking event
- `POST /api/deliveries/:id/pod` (driver/admin) -> save proof_json + mark delivered
- `PUT /api/admin/deliveries/:id/assign` (admin) -> assign delivery to driver

## Web UI
- `/driver` -> manifest
- `/driver/deliveries/:id` -> detail, status updates, PoD

## Mobile App
- `mobile-app/App.tsx` contains driver login + manifest + delivery detail.
- Set `API Base` to your ngrok domain.

## Demo seed user
- Driver: `+27000000021` / `StrongPass123!`
