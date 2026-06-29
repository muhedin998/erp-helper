# Latko Sync Server

## Quick Start

```bash
cd sync-server
npm install
npm start
```

Server runs on `http://0.0.0.0:3500` by default.

## Configuration

Edit `config.json`:

### Source: File (CSV or JSON)

```json
{
  "source": "file",
  "file": {
    "path": "C:\\Data\\products.csv",
    "csv": {
      "delimiter": ";",
      "columns": {
        "id": "SIFRA",
        "sifra": "SIFRA",
        "barcode": "BARCODE",
        "naziv": "NAZIV",
        "cena": "CENA"
      }
    }
  }
}
```

### Source: Firebird

```json
{
  "source": "firebird",
  "firebird": {
    "host": "localhost",
    "port": 3050,
    "database": "C:\\Firebird\\data\\MARKET.FDB",
    "user": "SYSDBA",
    "password": "masterkey",
    "query": "SELECT * FROM ARTIKALI WHERE AKTIVAN = 1"
  }
}
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/sync/products` | Full product sync (gzipped) |
| `GET /api/sync/products?since=ISO` | Delta sync since timestamp |
| `GET /api/sync/products/count` | Product count |
| `POST /api/reload` | Reload data without restart |

## Windows Autostart

Create a shortcut or `.bat` file:

```bat
cd /d C:\path\to\sync-server
node server.js
pause
```

Or use PM2 for production:

```bash
npm install -g pm2
pm2 start server.js --name latko-sync
pm2 save
pm2 startup
```
