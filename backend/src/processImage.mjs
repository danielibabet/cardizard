// ─────────────────────────────────────────────────────────────────────────────
// processImage.mjs — Cardizard Pokémon TCG Scanner (v2)
//
// Flujo:  Textract OCR → Cache DynamoDB → pokemontcg.io → Explosión variantes
// Coste:  $0 (Textract free tier + APIs públicas + DynamoDB free tier)
// ─────────────────────────────────────────────────────────────────────────────

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "crypto";

// ─── AWS Clients ────────────────────────────────────────────────────────────

const s3 = new S3Client({});
const textract = new TextractClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ─── Configuration ──────────────────────────────────────────────────────────

const BUCKET = process.env.UPLOAD_BUCKET_NAME;
const CACHE_TABLE = process.env.CACHE_TABLE_NAME;
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 h

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

// ─── Variant label mapping (TCGPlayer price keys → human-readable) ──────────

const VARIANT_LABELS = {
  normal: "Normal",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  "1stEditionHolofoil": "1st Edition Holo",
  "1stEditionNormal": "1st Edition",
  unlimitedHolofoil: "Unlimited Holo",
};

// ─── Rarity translation EN → ES ─────────────────────────────────────────────

const RARITY_ES = {
  Common: "Común",
  Uncommon: "Infrecuente",
  Rare: "Rara",
  "Rare Holo": "Rara Holo",
  "Rare Holo V": "Rara Holo V",
  "Rare Holo VMAX": "Rara Holo VMAX",
  "Rare Holo VSTAR": "Rara Holo VSTAR",
  "Rare Ultra": "Ultra Rara",
  "Ultra Rare": "Ultra Rara",
  "Double Rare": "Doble Rara",
  "Rare Secret": "Rara Secreta",
  "Secret Rare": "Rara Secreta",
  "Rare Rainbow": "Rainbow Rara",
  "Amazing Rare": "Amazing Rara",
  "Illustration Rare": "Illustration Rare",
  "Special Art Rare": "Special Art Rare",
  "Hyper Rare": "Hyper Rara",
  "ACE SPEC Rare": "ACE SPEC Rara",
  Promo: "Promo",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { imageId } = body;

    if (!imageId) {
      return respond(400, { error: "Missing imageId" });
    }

    // ── 1. OCR con Textract ─────────────────────────────────────────────
    let lines;
    try {
      lines = await runTextract(imageId);
    } catch (ocrError) {
      console.error("Textract failed:", ocrError);
      await cleanupS3(imageId);
      return respond(500, { error: "OCR failed – try a clearer photo" });
    }

    console.log("=== OCR LINES (ALL)", JSON.stringify(lines));

    // ── 2. Extraer número de carta y nombre ─────────────────────────────
    const { cardNumber, totalCards } = extractCardNumber(lines);
    const possibleName = extractCardName(lines);
    console.log("Extracted →", { cardNumber, totalCards, possibleName });

    if (!cardNumber && possibleName === "Unknown") {
      await cleanupS3(imageId);
      return respond(200, {
        variants: [],
        lines: lines.slice(0, 5),
        message: "Could not read the card – try with better lighting",
      });
    }

    // ── 3. Consultar caché DynamoDB ─────────────────────────────────────
    const cacheKey = buildCacheKey(cardNumber, possibleName);

    if (cacheKey) {
      const cached = await getCache(cacheKey);
      if (cached) {
        console.log("CACHE HIT:", cacheKey);
        await cleanupS3(imageId);
        return respond(200, cached);
      }
      console.log("CACHE MISS:", cacheKey);
    }

    // ── 4. Buscar en pokemontcg.io ──────────────────────────────────────
    let cards;
    try {
      cards = await searchPokemonTCG(cardNumber, possibleName);
    } catch (apiError) {
      console.error("pokemontcg.io failed:", apiError);
      await cleanupS3(imageId);
      return respond(500, { error: "Price API unavailable – try again later" });
    }

    // ── 5. Puntuar y ordenar candidatos ─────────────────────────────────
    const ranked = scoreCandidates(cards, cardNumber, possibleName, totalCards, lines);
    const topCards = ranked.slice(0, 3);

    // ── 6. Explotar variantes + datos en español ────────────────────────
    const allVariants = [];

    await Promise.all(
      topCards.map(async (card) => {
        const { spanishSet, spanishImage } = await fetchSpanishData(card);
        const variants = explodeVariants(card, spanishSet, spanishImage);
        allVariants.push(...variants);
      })
    );

    const result = {
      variants: allVariants,
      lines: lines.slice(0, 5),
    };

    // ── 7. Guardar en caché ─────────────────────────────────────────────
    if (cacheKey && allVariants.length > 0) {
      await setCache(cacheKey, result);
    }

    // ── 8. Borrar imagen de S3 (privacidad + ahorro) ────────────────────
    await cleanupS3(imageId);

    return respond(200, result);
  } catch (error) {
    console.error("Fatal error in processImage:", error);
    return respond(500, { error: "Error processing the image" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  OCR EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Invokes AWS Textract on the uploaded S3 image and returns an array of text lines.
 */
async function runTextract(imageId) {
  const res = await textract.send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: BUCKET, Name: imageId } },
    })
  );
  return (res.Blocks || []).filter((b) => b.BlockType === "LINE").map((b) => b.Text);
}

/**
 * Extracts card number from OCR lines.
 *
 * Supported patterns:
 *   025/165  →  cardNumber "25",  totalCards "165"
 *   25/165   →  cardNumber "25",  totalCards "165"
 *   TG01/TG30 → cardNumber "TG01", totalCards "TG30"
 *   SWSH076  →  cardNumber "SWSH076", totalCards null
 *   SVP 023  →  cardNumber "SVP023",  totalCards null
 */
function extractCardNumber(lines) {
  // Pass 1: "number/total" pattern (most common on modern cards)
  for (const line of lines) {
    const m = line.match(/\b([A-Za-z]{0,4}\d{1,4})\s*\/\s*([A-Za-z]{0,2}\d{1,4})\b/);
    if (m) {
      let num = m[1].toUpperCase();
      // Strip leading zeros for purely numeric numbers: 025 → 25
      if (/^\d+$/.test(num)) num = String(parseInt(num, 10));
      return { cardNumber: num, totalCards: m[2] };
    }
  }

  // Pass 2: Promo / special codes without slash (SWSH076, SVP023, SM241)
  for (const line of lines) {
    const m = line.match(/\b([A-Z]{2,5}\s*\d{2,4})\b/);
    if (m) {
      const num = m[1].replace(/\s+/g, ""); // "SVP 023" → "SVP023"
      return { cardNumber: num, totalCards: null };
    }
  }

  return { cardNumber: null, totalCards: null };
}

/**
 * Extracts the most likely card name from OCR lines.
 * Skips noise words that commonly appear on Pokémon cards.
 */
function extractCardName(lines) {
  const noise = [
    "basic", "bsic", "fase", "stage", "vmax", "vstar", "hp", "ps",
    "pager", "evolucion", "evolution", "weakness", "resistance",
    "retreat", "debilidad", "retirada", "regla", "rule", "ability",
    "habilidad", "pokemon", "pokémon",
  ];

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (
      lower.length > 2 &&
      !noise.some((w) => lower.includes(w)) &&
      !/^\d+$/.test(lower) &&
      !lower.includes("$") &&
      !lower.includes("€") &&
      !/^\d+\s*\/\s*\d+$/.test(lower)
    ) {
      return line.trim();
    }
  }
  return "Unknown";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  POKEMONTCG.IO SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Queries pokemontcg.io with progressive fallback strategies:
 *   1. number + name  (most precise)
 *   2. number only    (broader)
 *   3. name only      (broadest fallback)
 */
async function searchPokemonTCG(cardNumber, possibleName) {
  const searchWord = longestWord(possibleName);

  // Strategy 1: number + name → most precise match
  if (cardNumber && searchWord) {
    const q = `number:"${cardNumber}" name:"*${searchWord}*"`;
    const data = await fetchPTCG(q, 10);
    if (data?.length) return data;
  }

  // Strategy 2: number only → catches name-misread cases
  if (cardNumber) {
    const q = `number:"${cardNumber}"`;
    const data = await fetchPTCG(q, 25);
    if (data?.length) return data;
  }

  // Strategy 3: name only → last resort
  if (searchWord) {
    const q = `name:"*${searchWord}*"`;
    const data = await fetchPTCG(q, 50);
    if (data?.length) return data;
  }

  return [];
}

/**
 * Low-level HTTP fetch to pokemontcg.io v2.
 */
async function fetchPTCG(query, pageSize) {
  try {
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${pageSize}`;
    console.log("PTCG →", url);
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("PTCG HTTP", res.status);
      return null;
    }
    const json = await res.json();
    return json.data?.length ? json.data : null;
  } catch (e) {
    console.error("PTCG fetch error:", e.message);
    return null;
  }
}

/**
 * Returns the longest word (>2 chars) from a name string, for API search.
 * "Mega Charizard EX" → "Charizard"
 */
function longestWord(name) {
  if (!name || name === "Unknown") return null;
  const words = name
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\- ]/g, "")
    .split(/[\s-]+/);
  return words.filter((w) => w.length > 2).sort((a, b) => b.length - a.length)[0] || null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CANDIDATE SCORING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Assigns a relevance score to each candidate card and returns them sorted
 * by descending score. Uses multiple signals from the OCR text.
 */
function scoreCandidates(cards, cardNumber, possibleName, totalCards, lines) {
  if (!cards?.length) return [];

  const fullText = lines.join(" ").toLowerCase();
  const nameWords = (possibleName || "")
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((w) => w.length > 2);

  // Try to extract HP from OCR (e.g. "210 HP", "HP 210", "210 PS")
  let ocrHp = null;
  for (const l of lines) {
    const m = l.match(/\b(\d{2,3})\s*(?:hp|ps)\b/i) || l.match(/\b(?:hp|ps)\s*(\d{2,3})\b/i);
    if (m) {
      ocrHp = m[1];
      break;
    }
  }

  for (const c of cards) {
    c._score = 0;
    const cName = c.name.toLowerCase();

    // ── Card number match (highest signal) ──
    if (cardNumber) {
      const numNorm = /^\d+$/.test(cardNumber) ? String(parseInt(cardNumber, 10)) : cardNumber;
      const cNum = /^\d+$/.test(c.number) ? String(parseInt(c.number, 10)) : c.number;
      if (numNorm.toUpperCase() === cNum.toUpperCase()) c._score += 1000;
    }

    // ── Total cards match → likely same set ──
    if (totalCards && c.set?.printedTotal) {
      const total = /^\d+$/.test(totalCards) ? String(parseInt(totalCards, 10)) : totalCards;
      if (String(c.set.printedTotal) === total) c._score += 500;
    }

    // ── Exact name match ──
    if (cName === (possibleName || "").toLowerCase().trim()) c._score += 400;

    // ── HP match ──
    if (ocrHp && c.hp === ocrHp) c._score += 200;

    // ── Attack names found in OCR text ──
    if (c.attacks) {
      for (const atk of c.attacks) {
        if (atk.name && fullText.includes(atk.name.toLowerCase())) {
          c._score += 150;
        }
      }
    }

    // ── Partial name word matches ──
    for (const w of nameWords) {
      if (cName.includes(w)) c._score += 10;
    }

    // ── Suffix matches (ex, gx, v, vmax, vstar) ──
    const lowerName = (possibleName || "").toLowerCase();
    for (const suffix of ["ex", "gx", " v", "vmax", "vstar"]) {
      if (lowerName.includes(suffix) && cName.includes(suffix)) {
        c._score += 20;
      }
    }

    // ── Mega variant detection ──
    if (lowerName.includes("mega") && cName.startsWith("m ")) c._score += 15;
  }

  return cards.sort((a, b) => b._score - a._score);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  VARIANT EXPLOSION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Explodes a single card's embedded pricing data into separate variant objects.
 *
 * Strategy (priority order):
 *  1. Cardmarket EUR prices  → trendPrice (Normal) + reverseHoloTrend (Reverse Holo)
 *  2. TCGPlayer USD prices   → one object per finish key (normal, holofoil, reverseHolofoil...)
 *  3. Last resort            → single "Normal" entry with price "N/A"
 *
 * Both Cardmarket AND TCGPlayer entries are added when both are available,
 * giving the user the most complete picture of market value.
 */
function explodeVariants(card, spanishSet, spanishImage) {
  const variants = [];

  const base = {
    name: card.name,
    rarity: RARITY_ES[card.rarity] || card.rarity || "Unknown",
    set: spanishSet,
    number: card.number || null,
    cardId: card.id,
    imageUrl: spanishImage,
  };

  console.log(`[explodeVariants] ${card.id} — tcgplayer:`, JSON.stringify(card.tcgplayer?.prices), "cardmarket:", JSON.stringify(card.cardmarket?.prices));

  // ── 1. Cardmarket EUR (priority for European users) ────────────────────
  const cm = card.cardmarket?.prices;
  if (cm) {
    const normalPrice = cm.trendPrice ?? cm.averageSellPrice ?? null;
    if (normalPrice != null && normalPrice > 0) {
      variants.push({
        ...base,
        variant: "Normal",
        price: `€${normalPrice.toFixed(2)}`,
        priceSource: "Cardmarket",
      });
    }

    // reverseHoloTrend > 0 means there IS a reverse holo market for this card
    const revPrice = cm.reverseHoloTrend ?? null;
    if (revPrice != null && revPrice > 0) {
      variants.push({
        ...base,
        variant: "Reverse Holo",
        price: `€${revPrice.toFixed(2)}`,
        priceSource: "Cardmarket",
      });
    }
  }

  // ── 2. TCGPlayer USD (per finish-type sub-keys) ────────────────────────
  const tp = card.tcgplayer?.prices;
  if (tp && Object.keys(tp).length > 0) {
    for (const [key, priceData] of Object.entries(tp)) {
      const price = priceData.market ?? priceData.mid ?? priceData.low ?? null;
      const label = VARIANT_LABELS[key] || humanize(key);

      // Avoid duplicating a "Normal" entry already covered by Cardmarket
      const alreadyHaveNormal = variants.some(
        (v) => v.variant === "Normal" && v.priceSource === "Cardmarket"
      );
      const alreadyHaveReverse = variants.some(
        (v) => v.variant === "Reverse Holo" && v.priceSource === "Cardmarket"
      );
      if (label === "Normal" && alreadyHaveNormal) continue;
      if (label === "Reverse Holo" && alreadyHaveReverse) continue;

      variants.push({
        ...base,
        variant: label,
        price: price != null ? `$${price.toFixed(2)}` : "N/A",
        priceSource: "TCGPlayer",
      });
    }
  }

  // ── 3. Last resort: no pricing data from any source ────────────────────
  if (variants.length === 0) {
    variants.push({
      ...base,
      variant: "Normal",
      price: "N/A",
      priceSource: "Sin datos",
    });
  }

  return variants;
}

/**
 * Converts a camelCase key into a human-readable label.
 * "reverseHolofoil" → "Reverse Holofoil"
 */
function humanize(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SPANISH DATA (TCGdex)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fetches Spanish set name and high-quality image from TCGdex.
 * Non-critical: falls back to English data on failure.
 */
async function fetchSpanishData(card) {
  let spanishSet = card.set?.name || "Unknown";
  let spanishImage = card.images?.small || null;

  if (!card.id) return { spanishSet, spanishImage };

  try {
    const res = await fetch(`https://api.tcgdex.net/v2/es/cards/${card.id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.set?.name) spanishSet = data.set.name;
      if (data.image) spanishImage = `${data.image}/high.webp`;
    }
  } catch (_) {
    /* TCGdex is non-critical — silently fall back to English */
  }

  return { spanishSet, spanishImage };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DYNAMODB CACHE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Builds a deterministic cache key from card number + name.
 * Uses MD5 hash to normalise into a valid DynamoDB key.
 *
 * Same card scanned twice (even from different photos) produces the same
 * cardNumber + name → same cache key → cache hit.
 */
function buildCacheKey(cardNumber, name) {
  if (!cardNumber) return null;
  const raw = `${cardNumber}::${(name || "unknown").toLowerCase().trim()}`;
  return createHash("md5").update(raw).digest("hex");
}

/**
 * Reads from DynamoDB cache. Returns null on miss or expired TTL.
 * Gracefully degrades: if DynamoDB is unreachable, returns null (no crash).
 */
async function getCache(key) {
  if (!CACHE_TABLE) return null;
  try {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: CACHE_TABLE, Key: { cacheKey: key } })
    );
    if (Item && Item.ttl > Math.floor(Date.now() / 1000)) {
      return Item.result;
    }
  } catch (e) {
    console.warn("Cache GET error:", e.message);
  }
  return null;
}

/**
 * Writes result to DynamoDB with a TTL of 24 hours.
 * Fire-and-forget: cache write failures do not break the response flow.
 */
async function setCache(key, result) {
  if (!CACHE_TABLE) return;
  try {
    await ddb.send(
      new PutCommand({
        TableName: CACHE_TABLE,
        Item: {
          cacheKey: key,
          result,
          ttl: Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS,
          createdAt: new Date().toISOString(),
        },
      })
    );
  } catch (e) {
    console.warn("Cache PUT error:", e.message);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

async function cleanupS3(imageId) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: imageId }));
  } catch (e) {
    console.warn("S3 cleanup error:", e.message);
  }
}
