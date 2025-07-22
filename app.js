import fs from 'fs/promises';
import axios from 'axios';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const {
    GEMINI_API_KEY,
    QDRANT_API_KEY,
    QDRANT_HOST,
    COLLECTION_NAME
} = process.env;

// Validate environment variables
if (!GEMINI_API_KEY || !QDRANT_API_KEY || !QDRANT_HOST || !COLLECTION_NAME) {
    throw new Error("Missing required environment variables");
}

// 1. Chunk Text
function chunkText(text, size = 500) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

// 2. Embed with Gemini
async function embedWithGemini(texts) {
    try {
        const embeddings = [];

        for (const text of texts) {
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${GEMINI_API_KEY}`,
                {
                    model: "models/embedding-001",
                    content: { parts: [{ text }] }
                },
                {
                    timeout: 30000 // 30 seconds timeout
                }
            );

            if (!res.data.embedding?.values) {
                throw new Error("Invalid response from Gemini API");
            }

            embeddings.push(res.data.embedding.values);
        }

        return embeddings;
    } catch (error) {
        console.error("Error in embedWithGemini:", error.message);
        throw error;
    }
}

// 3. Create Qdrant Collection
async function createCollection(dim = 768) {
    try {
        await axios.put(
            `${QDRANT_HOST}/collections/${COLLECTION_NAME}`,
            {
                vectors: {
                    size: dim,
                    distance: "Cosine"
                }
            },
            {
                headers: {
                    "api-key": QDRANT_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            }
        );
        console.log("✅ Collection created or already exists.");
    } catch (error) {
        if (error.response?.status === 409) {
            console.log("ℹ️ Collection already exists");
            return;
        }
        console.error("Error creating collection:", error.message);
        throw error;
    }
}

// 4. Upsert to Qdrant
async function upsertToQdrant(ids, texts, embeddings) {
    try {
        const points = ids.map((id, i) => ({
            id,
            vector: embeddings[i],
            payload: { text: texts[i] }
        }));

        await axios.put(
            `${QDRANT_HOST}/collections/${COLLECTION_NAME}/points`,
            { points },
            {
                headers: {
                    "api-key": QDRANT_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        console.log(`✅ ${points.length} embeddings uploaded to Qdrant.`);
    } catch (error) {
        console.error("Error upserting to Qdrant:", error.message);
        throw error;
    }
}

// 5. Search Qdrant
async function searchQdrant(queryVector, topK = 3) {
    const res = await axios.post(
        `${QDRANT_HOST}/collections/${COLLECTION_NAME}/points/search`,
        {
            vector: queryVector,
            limit: topK,
            with_payload: true,
            with_vectors: false
        },
        { headers: { "api-key": QDRANT_API_KEY } }
    );

    if (!res.data?.result) {
        console.error("Qdrant search error:", res.data);
        throw new Error("Invalid search response from Qdrant");
    }

    return res.data.result
        .filter(item => item.payload?.text)
        .map(item => item.payload.text)
        .join("\n\n---\n\n");
}

// 6. Ask Gemini a question
async function askGemini(query, context) {
    try {
        const prompt = `Context:\n${context}\n\nQuestion: ${query}\nAnswer:`;

        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API key is not configured");
        }

        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }],
                    role: "user"
                }]
            },
            {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        // More robust response parsing
        if (!res.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.error("Unexpected Gemini response:", JSON.stringify(res.data, null, 2));
            throw new Error("Received empty or unexpected response from Gemini");
        }

        return res.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("\nDetailed Gemini API Error:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        return "❌ Sorry, I couldn't process your request. Please check your API key and network connection.";
    }
}

// 7. Chat CLI
async function startChat() {
    console.log("\n💬 You can now chat with your document. Type 'exit' to quit.\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.setPrompt("You: ");
    rl.prompt();

    rl.on("line", async (line) => {
        const query = line.trim();
        if (query.toLowerCase() === "exit") {
            rl.close();
            return;
        }

        if (!query) {
            rl.prompt();
            return;
        }

        try {
            process.stdout.write("🤖 Thinking...");

            const queryEmbedding = await embedWithGemini([query]);
            const context = await searchQdrant(queryEmbedding[0]);
            const answer = await askGemini(query, context);

            process.stdout.write("\r\x1b[K");
            console.log("\n🤖 Gemini:", answer);
        } catch (err) {
            console.error("\n❌ Error:", err.message);
        }

        rl.prompt();
    });

    rl.on("close", () => {
        console.log("\n👋 Goodbye!");
        process.exit(0);
    });
}

// 8. Main
async function main() {
    try {
        console.log("Testing Gemini API connection...");
        await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    } catch (error) {
        throw new Error(`Gemini API connection failed: ${error.message}`);
    }
    try {
        const text = await fs.readFile("text.txt", "utf8");
        const chunks = chunkText(text, 500);
        const ids = chunks.map((_, i) => i + 1);

        console.log(`Processing ${chunks.length} chunks...`);

        await createCollection();
        const embeddings = await embedWithGemini(chunks);
        await upsertToQdrant(ids, chunks, embeddings);

        await startChat();
    } catch (error) {
        console.error("Fatal error:", error.message);
        process.exit(1);
    }
}

main();