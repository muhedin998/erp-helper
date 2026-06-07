# KICKOFF - Offline Inventory Replenishment & Purchasing Assistant

## Overview

Offline Android aplikacija za prodavnice koja omogućava:

- skeniranje barkodova tokom obilaska objekta
- kreiranje lista za dopunu polica
- upravljanje lokalnim katalogom artikala
- istoriju svih lista po datumu
- pregled lista u read-only režimu
- kupovni režim (checklist)
- PDF/CSV/XLSX eksport
- Android štampu

Bez servera. Bez interneta. Sve lokalno na telefonu.

---

# Tehnologije

- Angular 20+
- Ionic
- Capacitor
- SQLite (@capacitor-community/sqlite)
- Google ML Kit Barcode Scanner
- NgRx Signal Store

---

# Glavni tok rada

## Korak 1 - Kreiranje liste

Korisnik klikne:

Nova lista

Status:

DRAFT

Lista je potpuno izmenjiva.

---

## Korak 2 - Obilazak objekta

Korisnik:

- skenira barkod
- ručno unosi barkod
- ručno unosi šifru

Prilikom skeniranja:

- pronalazi se artikal
- dodaje se na listu
- ako već postoji povećava se količina

Primer:

Coca Cola -> 1

ponovno skeniranje

Coca Cola -> 2

---

## Korak 3 - Završetak liste

Klik:

Završi listu

Status:

READY_FOR_PURCHASE

Od tog trenutka lista se smatra spremnom za nabavku.

---

## Korak 4 - Kupovina

Poseban ekran:

PURCHASE MODE

Prikaz:

[ ] Coca Cola 10

[ ] Mleko 5

[ ] Smoki 8

Tokom kupovine:

[x] Coca Cola 10

[x] Mleko 5

[ ] Smoki 8

Napredak:

66% završeno

---

# Statusi lista

- DRAFT
- READY_FOR_PURCHASE
- PURCHASED

---

# Product Model

```ts
interface Product {
  id: number;

  sifra: string;
  barcode: string;

  naziv: string;

  cena?: number;

  grupa?: string;

  jedinicaMere?: string;

  source: 'ACIS' | 'MANUAL';

  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

---

# Shopping List Model

```ts
interface ShoppingList {
  id: string;

  naziv: string;

  createdAt: Date;

  completedAt?: Date;

  status:
    | 'DRAFT'
    | 'READY_FOR_PURCHASE'
    | 'PURCHASED';

  note?: string;
}
```

---

# Shopping List Item

```ts
interface ShoppingListItem {
  id: string;

  listId: string;

  productId: number;

  quantity: number;

  purchasedQuantity?: number;

  checked: boolean;
}
```

---

# Istorija

Istorija se organizuje po datumu.

Primer:

31.05.2026

- Dopuna police
- 28 artikala
- READY_FOR_PURCHASE

30.05.2026

- Dopuna police
- 42 artikla
- PURCHASED

Sortiranje:

Najnovije prvo.

Minimalno čuvanje:

30 dana.

Poželjno:

Neograničeno dok korisnik ručno ne obriše.

---

# Read Only View

Kada korisnik otvori staru listu:

- nema editovanja
- samo pregled

Prikaz:

- Šifra
- Naziv
- Količina

---

# Edit View

Ako je lista DRAFT:

omogućeno:

- dodavanje
- brisanje
- promena količina
- novo skeniranje

---

# Clone List

Funkcija:

Kloniraj listu

Koristi se za česte dopune.

Kreira novu DRAFT listu sa postojećim stavkama.

---

# Katalog

Podržati:

- pregled
- pretragu
- dodavanje
- izmenu
- soft delete

Pretraga:

- po nazivu
- po šifri
- po barkodu

Za velike kataloge koristiti SQLite FTS5.

---

# Import kataloga

CSV import.

Primer:

sifra,naziv,barcode,cena

Proces:

1. učitaj fajl
2. validiraj
3. preview
4. potvrda
5. zameni ACIS artikle
6. sačuvaj MANUAL artikle

---

# Export

Podržati:

- CSV
- XLSX
- PDF

PDF primer:

LISTA ZA NABAVKU

Datum: 31.05.2026

Šifra | Naziv | Količina

1001 | Coca Cola | 10

1002 | Smoki | 5

1003 | Mleko | 8

Ukupno artikala: 23

---

# Share

Android Share Sheet:

- Email
- WhatsApp
- Viber
- Google Drive

---

# Print Support

Obavezno podržati:

- generisanje PDF-a
- Android Print Service

Korisnik može:

- pregledati PDF
- poslati PDF
- odštampati PDF

---

# Ekrani

## Home

- Nova lista
- Istorija
- Katalog
- Import
- Podešavanja

## Aktivna lista

- Kamera
- Ručni unos
- Pretraga
- Stavke

## Purchase Mode

Checklist za kupovinu.

## History

Liste po datumu.

## Catalog

CRUD nad artiklima.

## Import

CSV import.

---

# MVP

Verzija 1.0 mora imati:

- Offline rad
- SQLite
- Barkod skeniranje
- Katalog
- Liste
- Istoriju
- Read-only prikaz
- Purchase mode
- CSV import
- PDF export
- Android štampu

---

# Success Criteria

Radnik može:

1. napraviti listu
2. obići objekat
3. skenirati artikle
4. završiti listu
5. otići u nabavku
6. koristiti checklist režim
7. odštampati ili poslati listu

Bez računara i bez pristupa ACIS sistemu.
