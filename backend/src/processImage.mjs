import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";

const s3Client = new S3Client({});
const textractClient = new TextractClient({});

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { imageId } = body;

    if (!imageId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing imageId" })
      };
    }

    const bucketName = process.env.UPLOAD_BUCKET_NAME;

    // 1. Llamar a Textract
    const textractCommand = new DetectDocumentTextCommand({
      Document: {
        S3Object: {
          Bucket: bucketName,
          Name: imageId
        }
      }
    });

    const textractResponse = await textractClient.send(textractCommand);
    const lines = textractResponse.Blocks.filter(b => b.BlockType === "LINE").map(b => b.Text);
    
    console.log("=== TEXTRACT EXTRACTED LINES ===");
    console.log(lines.slice(0, 10)); // Logueamos las 10 primeras líneas para depurar
    
    // Mejorar la heurística esquivando raíces de palabras comunes (y errores de OCR como 'pager')
    const ignoreWords = [
      "basic", "bsic", "fase", "stage", "vmax", "vstar", "hp", "ps", "pager", "evolucion", "evolution"
    ];
    let possibleName = "Unknown";
    
    for (let line of lines) {
      const lower = line.toLowerCase().trim();
      // Ignorar líneas muy cortas o que contengan alguna de las palabras prohibidas
      if (lower.length > 2 && !ignoreWords.some(w => lower.includes(w)) && !lower.match(/^[0-9]+$/) && !lower.includes("$")) {
        possibleName = line;
        break;
      }
    }

    let cardNumber = null;
    for (let line of lines) {
      // Buscar patrones como "015/165" o "TG01/TG30"
      const match = line.match(/\b([A-Z0-9]+)\/([0-9]+)\b/);
      if (match) {
        cardNumber = match[1];
        // Si es puramente numérico, a veces pokemontcg.io le quita los ceros a la izquierda (015 -> 15)
        if (/^\d+$/.test(cardNumber)) {
          cardNumber = parseInt(cardNumber, 10).toString();
        }
        break;
      }
    }

    console.log("Selected possible name:", possibleName, "Card Number:", cardNumber);

    let cardData = { name: possibleName, rarity: "Unknown", set: "Unknown", price: "N/A", lines: lines.slice(0, 5) };

    // 2. Consultar a pokemontcg.io API
    try {
      // Extraer la palabra más larga (ej: "Mega-Gengar" -> "Gengar", "Rotom V" -> "Rotom")
      const words = possibleName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ -]/g, '').split(/[\s-]+/);
      let searchWord = words.sort((a, b) => b.length - a.length)[0];
      if (!searchWord) searchWord = possibleName;

      let queryExact = cardNumber ? `name:"*${searchWord}*" number:"${cardNumber}"` : null;
      let queryGeneric = `name:"*${searchWord}*"`;
      
      let ptcgData = null;

      // Intentar primero con nombre y número exacto
      if (queryExact) {
        const responseExact = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryExact)}&pageSize=5`);
        if (responseExact.ok) {
          const dataExact = await responseExact.json();
          if (dataExact.data && dataExact.data.length > 0) {
            ptcgData = dataExact;
          }
        }
      }

      // Si no se encontró o no teníamos número, hacer búsqueda genérica por nombre (hasta 250 resultados para que no se queden fuera variantes)
      if (!ptcgData) {
        const responseGeneric = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryGeneric)}&pageSize=250`);
        if (responseGeneric.ok) {
          ptcgData = await responseGeneric.json();
        }
      }
      
      if (ptcgData && ptcgData.data && ptcgData.data.length > 0) {
        
        let candidates = [...ptcgData.data];
        
        // Extraer HP del OCR (suele ser un número de 2 a 3 dígitos suelto, o seguido/precedido de HP/PS)
        let extractedHp = null;
        for (let l of lines) {
          const hpMatch = l.match(/(?:hp|ps)?\s*(\d{2,3})\s*(?:hp|ps)?/i);
          if (hpMatch && hpMatch[1]) {
            extractedHp = hpMatch[1];
            break;
          }
        }

        // Convertir las líneas completas a un solo string para buscar ataques
        const fullOcrText = lines.join(' ').toLowerCase();
        
        // Asignar puntuaciones a cada candidato
        const searchWords = possibleName.toLowerCase().split(/[\s-]+/);
        
        candidates.forEach(c => {
          c.matchScore = 0;
          const cName = c.name.toLowerCase();
          
          if (cardNumber && (c.number === cardNumber || c.number === cardNumber.padStart(3, '0'))) {
            c.matchScore += 1000; // Prioridad absoluta si el número coincide
          }
          
          // Si el nombre coincide exactamente con lo detectado
          if (cName === possibleName.toLowerCase().replace(/\s+/g, ' ').trim()) {
            c.matchScore += 500;
          }
          
          // Si el HP coincide
          if (extractedHp && c.hp === extractedHp) {
            c.matchScore += 200;
          }

          // Si el nombre del ataque aparece en el texto del OCR
          if (c.attacks) {
            for (let atk of c.attacks) {
              if (atk.name && fullOcrText.includes(atk.name.toLowerCase())) {
                c.matchScore += 150;
              }
            }
          }

          for (let sw of searchWords) {
            if (sw.length > 2 && cName.includes(sw)) c.matchScore++;
          }
          
          // Bonus especiales para variantes antiguas Mega y EX/GX/V
          if (possibleName.toLowerCase().includes('mega') && cName.startsWith('m ')) c.matchScore += 2;
          if (possibleName.toLowerCase().includes('ex') && cName.includes('-ex')) c.matchScore += 2;
          if (possibleName.toLowerCase().includes('gx') && cName.includes('-gx')) c.matchScore += 2;
          if (possibleName.toLowerCase().includes('v') && cName.endsWith(' v')) c.matchScore += 2;
          
          // Check para Mega Charizard X vs Y
          if (possibleName.toLowerCase().includes(' x') || possibleName.toLowerCase().includes(' xex')) {
            if (c.types && c.types.includes('Dragon')) c.matchScore += 5;
          }
        });

        // Ordenar por puntuación descendente y quedarnos con los 5 mejores
        candidates.sort((a, b) => b.matchScore - a.matchScore);
        const topCandidates = candidates.slice(0, 5);

        // Mapear rarezas
        const rarityMap = {
          "Common": "Común", "Uncommon": "Infrecuente", "Rare": "Rara", "Rare Holo": "Rara Holo", 
          "Double Rare": "Doble Rara", "Ultra Rare": "Ultra Rara", "Secret Rare": "Rara Secreta"
        };

        // Procesar candidatos y obtener expansiones en español concurrentemente
        const variants = await Promise.all(topCandidates.map(async (card) => {
          let finalPrice = "N/A";
          let priceSource = "Unknown";
          
          const cm = card.cardmarket?.prices;
          const tp = card.tcgplayer?.prices;
          
          if (cm && cm.trendPrice) {
            finalPrice = `€${cm.trendPrice}`;
            priceSource = "Cardmarket";
          } else if (cm && cm.averageSellPrice) {
            finalPrice = `€${cm.averageSellPrice}`;
            priceSource = "Cardmarket";
          } else if (tp && tp.holofoil?.market) {
            finalPrice = `$${tp.holofoil.market}`;
            priceSource = "TCGPlayer";
          } else if (tp && tp.normal?.market) {
            finalPrice = `$${tp.normal.market}`;
            priceSource = "TCGPlayer";
          }

          let spanishSet = card.set?.name || "Unknown";
          let spanishImageUrl = card.images?.small || null;
          
          if (card.id) {
            try {
              const tcgdexRes = await fetch(`https://api.tcgdex.net/v2/es/cards/${card.id}`);
              if (tcgdexRes.ok) {
                const tcgdexData = await tcgdexRes.json();
                if (tcgdexData.set && tcgdexData.set.name) {
                  spanishSet = tcgdexData.set.name;
                }
                if (tcgdexData.image) {
                  // TCGdex returns base url, we add /high.webp
                  spanishImageUrl = `${tcgdexData.image}/high.webp`;
                }
              }
            } catch (e) { /* ignore */ }
          }

          return {
            name: card.name,
            rarity: rarityMap[card.rarity] || card.rarity || "Unknown",
            set: spanishSet,
            price: finalPrice,
            priceSource: priceSource,
            imageUrl: spanishImageUrl
          };
        }));

        cardData = {
          variants: variants,
          lines: lines.slice(0, 5)
        };
      }
    } catch (apiError) {
      console.error("Error calling PokemonTCG API", apiError);
    }

    // 3. Borrar la imagen de S3 para optimizar costes y privacidad
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: imageId
      }));
    } catch (deleteError) {
      console.error("Error deleting image from S3", deleteError);
    }

    // 4. Retornar el JSON
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(cardData)
    };

  } catch (error) {
    console.error("Error processing image", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Error processing the image" })
    };
  }
};
