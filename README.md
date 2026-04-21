# University Lost & Found System

## About the Project
The University Lost & Found System is a website designed to help students and staff report, track, and recover lost belongings in a simple and organized way. It supports the university community by making it easier to connect lost items with the people who own them.

## How It Works
Users can submit reports for both lost and found items. They can browse available listings, view item details, and join discussions where comments are allowed. Found-item reports are reviewed by staff or admin before they are shown publicly. When a user believes an item belongs to them, they can start a secure claim and handover process. Staff then verify ownership before the item is officially returned.

## Main Features
- Report lost items through an easy online form
- Report found items for staff review
- Browse available lost and found item listings
- View item details and discussion comments where allowed
- Start a secure claim and handover process
- Staff and admin review found-item submissions and verify ownership

## Local Run
1. Copy `.env.example` to `.env`
2. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env`
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

If port `3000` is already in use, start the server with another port, for example:

```bash
PORT=3001 npm start
```

## Chat Attachments
Chat attachments now upload through the Node server and are stored in the Supabase `Chat-proofs` bucket.

Required environment variables:

```env
SUPABASE_URL=https://stogzhtvnvobmhvoqxuy.supabase.co
SUPABASE_BUCKET=Chat-proofs
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FIREBASE_PROJECT_ID=lost-and-found-16023
```

The `SUPABASE_SERVICE_ROLE_KEY` must stay on the server only.

## Credits / Team Members
- [Susmita Dhar Priya](https://github.com/Priya-Dhar10)

This project aims to help the university community reconnect with lost belongings more quickly and safely.
