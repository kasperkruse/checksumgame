# 🌿 Græsslåning - Havemand

Et hyggeligt browser-spil hvor du slår græsset og tjener penge!

## 🎮 Spil

**Koncept:** Start som ejer af et lille hus. Slå græsset, tjen penge, og udvid dit arbejde (kommer snart).

**Styring:**
- `WASD` eller `piletaster` for at bevæge dig
- Gå hen over det høje græs for at slå det

**Mål:** Slå alt græsset for at tjene 100 kr!

## 🚀 Kør lokalt

```bash
# Installer afhængigheder
npm install

# Start udviklings-server
npm run dev
```

Åbn derefter `http://localhost:43567` i din browser.

## 🛠️ Teknologi

- Vite + Vanilla JavaScript
- HTML5 Canvas
- Ingen backend - kører 100% i browseren

## 📋 Roadmap

Næste opgaver til implementering:
- 🎨 Male hegnet
- 🌳 Beskære hækken
- 🚗 Vaske bilen
- 💰 Butik til at købe udstyr
- 🏠 Udvide huset

## 📁 Projektstruktur

```
├── index.html          # Hoved HTML med canvas og HUD
├── src/
│   ├── main.js         # Spil-logik (player, tiles, rendering)
│   └── style.css       # Styling til HUD og modals
├── public/
│   └── favicon.svg     # Spil-ikon
└── package.json        # Projekt-konfiguration
```

---

Lavet med 💚 i Danmark
