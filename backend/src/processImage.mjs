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
    
    // Aquí intentaríamos extraer el nombre y el número con expresiones regulares o simple búsqueda
    // Para simplificar, tomaremos la primera línea como posible nombre (frecuente en cartas)
    // En un caso real, la heurística sería más robusta.
    const possibleName = lines[0] || "Unknown";

    let cardData = { name: possibleName, rarity: "Unknown", set: "Unknown", price: "N/A" };

    // 2. Consultar a pokemontcg.io API
    try {
      // Buscar por nombre simplificado
      const query = encodeURIComponent(`name:"${possibleName.split(' ')[0]}"`);
      const ptcgResponse = await fetch(`https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=1`);
      
      if (ptcgResponse.ok) {
        const ptcgData = await ptcgResponse.json();
        if (ptcgData.data && ptcgData.data.length > 0) {
          const card = ptcgData.data[0];
          cardData = {
            name: card.name,
            rarity: card.rarity || "Unknown",
            set: card.set?.name || "Unknown",
            price: card.cardmarket?.prices?.averageSellPrice ? `€${card.cardmarket.prices.averageSellPrice}` : "N/A",
            imageUrl: card.images?.small || null
          };
        }
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
