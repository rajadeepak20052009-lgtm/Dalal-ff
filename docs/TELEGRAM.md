# Telegram owner bot

## Setup

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Get your numeric chat id from [@userinfobot](https://t.me/userinfobot).
3. Put both into `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:AA...
TELEGRAM_OWNER_ID=7536913361
```

4. Restart the app, then press **Send test message** in Admin → Dashboard.

Only `TELEGRAM_OWNER_ID` can talk to the bot. Every other chat is ignored.

## What you receive automatically

| Event                | Message                                                            |
| -------------------- | ------------------------------------------------------------------ |
| Likes delivered      | UID, nickname, region, likes before → after, added, code + balance |
| Payment UTR received | Order id, package, price, UTR + **YES / NO** buttons               |
| Order approved       | Order id with the assigned redeem code                             |
| AutoLikes run        | Per-UID result and the daily summary report                        |
| Admin events         | Login, code created, manual delivery, backup                       |

Pressing **YES** assigns a free code of the right size and marks the order
approved. Pressing **NO** rejects it. If no free code exists, the bot opens a
5-minute window — send the code as a plain message and it is attached to that
order.

## Sending data back to the bot

* **Forward a delivery card** back to the bot → it parses UID, likes and code
  and re-imports that record into the database.
* **Plain lines** also work:

```
uid=123456789 likes=1500 code=FF-ABC12345
```

* `/addcode FF-ABC12345 1500` adds or tops up a code.
* `/upload` then paste several lines at once for a bulk import.

## Commands

| Command        | Result                                        |
| -------------- | --------------------------------------------- |
| `/stats`       | Today + total likes, revenue, active AutoLikes|
| `/orders`      | Pending orders with approve buttons           |
| `/codes`       | Code inventory and balances                   |
| `/autolikes`   | Active subscriptions                          |
| `/find <uid>`  | Full delivery history for one UID             |
| `/backup`      | Creates a database backup                     |
